"use server";

import { headers } from "next/headers";
import { orderErrorMessage } from "@/lib/availability";
import { MIN_FORM_FILL_MS } from "@/lib/constants";
import { sendOrderEmail } from "@/lib/email";
import { toOrder } from "@/lib/mappers";
import { clientIp, getPrivateSettings, hashIp } from "@/lib/orders";
import { getSettings } from "@/lib/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { actionError, actionOk, type ActionResult } from "@/lib/types";
import { fieldErrorsOf, orderInputSchema } from "@/lib/validation";

export interface PlaceOrderState {
	result: ActionResult<{ token: string; reference: string }> | null;
}

/**
 * Takes an order.
 *
 * Nothing the browser sends is trusted with money or capacity: this hands the
 * items to `place_order`, which re-prices every line, re-checks the date against
 * lead time and the calendar, and takes an advisory lock so two customers cannot
 * both claim the last slot. Whatever comes back is what the customer is charged.
 *
 * Emails go out after the order is written and are allowed to fail. An order
 * that exists but whose confirmation bounced is recoverable; an order that was
 * rolled back because an SMTP server was slow is not.
 */
export async function placeOrder(
	_previous: PlaceOrderState,
	formData: FormData,
): Promise<PlaceOrderState> {
	const fail = (error: string, fieldErrors?: Record<string, string>): PlaceOrderState => ({
		result: actionError(error, fieldErrors),
	});

	// --- spam checks ---------------------------------------------------------
	// A hidden field no person can see, and a floor on how fast the form can be
	// completed. Between them these stop essentially all drive-by form spam
	// without putting a captcha in front of a customer buying cupcakes.
	if ((formData.get("website") as string | null)?.trim()) {
		return fail("Something went wrong sending your order. Please try again.");
	}

	// Zero means the form never finished mounting, which is a browser without
	// JavaScript rather than a bot. That fails open: the honeypot still applies,
	// and turning away a real customer is worse than letting one bot through.
	const startedAt = Number(formData.get("startedAt"));
	if (startedAt > 0 && Date.now() - startedAt < MIN_FORM_FILL_MS) {
		return fail("That was quick. Please take another look and submit again.");
	}

	if (!hasSupabaseConfig()) {
		return fail(
			"Ordering isn't switched on yet. Please get in touch on Instagram in the meantime.",
		);
	}

	// --- shape ---------------------------------------------------------------
	let items: unknown;
	try {
		items = JSON.parse(String(formData.get("items") ?? "[]"));
	} catch {
		return fail("Your order couldn't be read. Please try again.");
	}

	const parsed = orderInputSchema.safeParse({
		items,
		pickupDate: String(formData.get("pickupDate") ?? ""),
		fulfilment: String(formData.get("fulfilment") ?? "pickup"),
		customerName: String(formData.get("customerName") ?? ""),
		customerEmail: String(formData.get("customerEmail") ?? ""),
		customerPhone: String(formData.get("customerPhone") ?? ""),
		deliveryAddress: String(formData.get("deliveryAddress") ?? ""),
		notes: String(formData.get("notes") ?? ""),
		customRequest: String(formData.get("customRequest") ?? ""),
	});

	if (!parsed.success) {
		const fieldErrors = fieldErrorsOf(parsed.error);
		return fail(
			fieldErrors.items ?? "Please check the highlighted fields and try again.",
			fieldErrors,
		);
	}

	const input = parsed.data;

	// --- write ---------------------------------------------------------------
	const supabase = createAdminClient();
	const requestHeaders = await headers();

	const { data, error } = await supabase.rpc("place_order", {
		p_items: input.items.map((item) => ({ product_id: item.productId, qty: item.qty })),
		p_pickup_date: input.pickupDate,
		p_fulfilment: input.fulfilment,
		p_customer_name: input.customerName,
		p_customer_email: input.customerEmail,
		p_customer_phone: input.customerPhone,
		p_delivery_address: input.deliveryAddress ?? null,
		p_notes: input.notes ?? null,
		p_custom_request: input.customRequest ?? null,
		p_ip_hash: hashIp(clientIp(requestHeaders)),
	});

	if (error) {
		// place_order raises named exceptions; anything else is ours, not theirs.
		const message = orderErrorMessage(error.message);
		if (message === "Something went wrong sending your order. Please try again.") {
			console.error("[vvbakes] place_order failed", error);
		}
		return fail(message);
	}

	const placed = Array.isArray(data) ? data[0] : data;
	if (!placed) {
		console.error("[vvbakes] place_order returned nothing");
		return fail("Something went wrong sending your order. Please try again.");
	}

	// --- notify --------------------------------------------------------------
	await notify(placed.id);

	return { result: actionOk({ token: placed.token, reference: placed.reference }) };
}

/** Sends the two "we've got it" emails. Failures are logged, never surfaced. */
async function notify(orderId: string): Promise<void> {
	try {
		const supabase = createAdminClient();
		const { data } = await supabase
			.from("orders")
			.select("*, order_items (*)")
			.eq("id", orderId)
			.maybeSingle();

		if (!data) return;

		const order = toOrder(data);
		const [settings, privateSettings] = await Promise.all([getSettings(), getPrivateSettings()]);

		await Promise.all([
			sendOrderEmail({ template: "new-order-owner", order, settings, privateSettings }),
			sendOrderEmail({ template: "order-received", order, settings, privateSettings }),
		]);
	} catch (error) {
		console.error("[vvbakes] could not send order emails", error);
	}
}
