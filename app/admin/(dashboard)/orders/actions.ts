"use server";

import { revalidatePath } from "next/cache";
import { adminOrder } from "@/lib/admin-queries";
import { requireAdmin } from "@/lib/auth";
import { sendOrderEmail } from "@/lib/email";
import { getPrivateSettings } from "@/lib/orders";
import { getSettings } from "@/lib/queries";
import { allowedTransitions } from "@/lib/order-status";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/action-state";
import { actionError, actionOk, type OrderStatus } from "@/lib/types";
import { fieldErrorsOf, quoteSchema } from "@/lib/validation";

type State = FormState;

const TIMESTAMP_COLUMN: Partial<Record<OrderStatus, string>> = {
	confirmed: "confirmed_at",
	ready: "ready_at",
	collected: "collected_at",
	cancelled: "cancelled_at",
};

/** Which email, if any, a customer gets when an order reaches this status. */
const EMAIL_FOR_STATUS = {
	confirmed: "order-confirmed",
	ready: "order-ready",
	cancelled: "order-cancelled",
} as const;

export async function setOrderStatus(_previous: State, formData: FormData): Promise<State> {
	await requireAdmin();

	const id = String(formData.get("id") ?? "");
	const status = String(formData.get("status") ?? "") as OrderStatus;
	const reason = String(formData.get("reason") ?? "").trim();

	const order = await adminOrder(id);
	if (!order) return { result: actionError("That order no longer exists.") };

	if (status === "confirmed" && order.totalCents === 0) {
		return {
			result: actionError(
				"Put a price on this one first. Confirming sends the customer bank details and an amount, and right now that amount is nothing.",
			),
		};
	}

	if (!allowedTransitions(order.status).includes(status)) {
		return {
			result: actionError(`An order that is already ${order.status} can't be moved to ${status}.`),
		};
	}

	const supabase = await createClient();
	const column = TIMESTAMP_COLUMN[status];

	const { error } = await supabase
		.from("orders")
		.update({
			status,
			...(column ? { [column]: new Date().toISOString() } : {}),
			...(status === "cancelled" && reason ? { cancellation_reason: reason } : {}),
		})
		.eq("id", id);

	if (error) {
		console.error("[vvbakes] could not change order status", error);
		return { result: actionError("That couldn't be saved. Please try again.") };
	}

	await supabase.from("order_events").insert({
		order_id: id,
		type: "status_changed",
		data: { from: order.status, to: status, ...(reason ? { reason } : {}) },
	});

	// Email after the change, and never let it undo the change.
	const template = EMAIL_FOR_STATUS[status as keyof typeof EMAIL_FOR_STATUS];
	if (template) {
		const updated = await adminOrder(id);
		if (updated) {
			const [settings, privateSettings] = await Promise.all([getSettings(), getPrivateSettings()]);
			await sendOrderEmail({ template, order: updated, settings, privateSettings });
		}
	}

	revalidatePath("/admin/orders");
	revalidatePath(`/admin/orders/${id}`);
	revalidatePath("/admin");
	return { result: actionOk() };
}

/**
 * Puts a price on custom work.
 *
 * A custom cake arrives with no price, because nobody can quote one before
 * hearing what it is. The owner sets it here, and the order total becomes the
 * quote plus anything that came off the menu.
 */
export async function saveQuote(_previous: State, formData: FormData): Promise<State> {
	await requireAdmin();

	const parsed = quoteSchema.safeParse({
		id: formData.get("id") ?? "",
		quoteCents: formData.get("quote") ?? "",
	});

	if (!parsed.success) {
		return { result: actionError("Use a price like 85 or 85.50.", fieldErrorsOf(parsed.error)) };
	}

	const order = await adminOrder(parsed.data.id);
	if (!order) return { result: actionError("That order no longer exists.") };

	const total = order.subtotalCents + order.deliveryFeeCents + parsed.data.quoteCents;

	const supabase = await createClient();
	const { error } = await supabase
		.from("orders")
		.update({ quote_cents: parsed.data.quoteCents, total_cents: total })
		.eq("id", order.id);

	if (error) return { result: actionError("That price couldn't be saved. Please try again.") };

	await supabase.from("order_events").insert({
		order_id: order.id,
		type: "note",
		data: { quoted_cents: parsed.data.quoteCents, total_cents: total },
	});

	revalidatePath(`/admin/orders/${order.id}`);
	return { result: actionOk() };
}

export async function saveInternalNotes(_previous: State, formData: FormData): Promise<State> {
	await requireAdmin();

	const id = String(formData.get("id") ?? "");
	const notes = String(formData.get("internalNotes") ?? "").trim();

	const supabase = await createClient();
	const { error } = await supabase
		.from("orders")
		.update({ internal_notes: notes || null })
		.eq("id", id);

	if (error) return { result: actionError("Those notes couldn't be saved.") };

	revalidatePath(`/admin/orders/${id}`);
	return { result: actionOk() };
}

/** Sends a customer email again, for when the first one bounced. */
export async function resendEmail(_previous: State, formData: FormData): Promise<State> {
	await requireAdmin();

	const id = String(formData.get("id") ?? "");
	const order = await adminOrder(id);
	if (!order) return { result: actionError("That order no longer exists.") };

	const template =
		order.status === "confirmed"
			? "order-confirmed"
			: order.status === "ready"
				? "order-ready"
				: order.status === "cancelled"
					? "order-cancelled"
					: "order-received";

	const [settings, privateSettings] = await Promise.all([getSettings(), getPrivateSettings()]);
	const result = await sendOrderEmail({ template, order, settings, privateSettings });

	revalidatePath(`/admin/orders/${id}`);

	if (!result.sent) {
		return {
			result: actionError(
				result.skipped
					? `Email isn't set up yet (${result.skipped}).`
					: `That email didn't send: ${result.error ?? "unknown error"}`,
			),
		};
	}

	return { result: actionOk() };
}
