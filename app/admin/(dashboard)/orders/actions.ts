"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TemplateName } from "@/emails/templates";
import { adminOrder } from "@/lib/admin-queries";
import { ORDER_SELECT, toOrder } from "@/lib/mappers";
import { requireAdmin } from "@/lib/auth";
import { sendOrderEmail } from "@/lib/email";
import { getPrivateSettings } from "@/lib/orders";
import { deliveryFeeFor } from "@/lib/pricing";
import { getSettings } from "@/lib/queries";
import { allowedTransitions } from "@/lib/order-status";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { FormState } from "@/lib/action-state";
import { actionError, actionOk, type OrderStatus } from "@/lib/types";
import { fieldErrorsOf, newOrderSchema, orderDetailsSchema, quoteSchema } from "@/lib/validation";

type State = FormState;

const TIMESTAMP_COLUMN: Partial<Record<OrderStatus, string>> = {
	confirmed: "confirmed_at",
	ready: "ready_at",
	collected: "collected_at",
	cancelled: "cancelled_at",
};

/** Which email, if any, a customer gets when an order reaches this status. */
const EMAIL_FOR_STATUS: Partial<Record<OrderStatus, TemplateName>> = {
	confirmed: "order-confirmed",
	ready: "order-ready",
	cancelled: "order-cancelled",
};

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

	// The updated row comes back from the write itself. Reading it again for the
	// email would be a second round trip for something we have just been handed.
	const { data: updatedRow, error } = await supabase
		.from("orders")
		.update({
			status,
			...(column ? { [column]: new Date().toISOString() } : {}),
			...(status === "cancelled" && reason ? { cancellation_reason: reason } : {}),
		})
		.eq("id", id)
		.select(ORDER_SELECT)
		.maybeSingle();

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
	const template = EMAIL_FOR_STATUS[status];
	if (template && updatedRow) {
		const updated = toOrder(updatedRow);
		const [settings, privateSettings] = await Promise.all([getSettings(), getPrivateSettings()]);
		await sendOrderEmail({ template, order: updated, settings, privateSettings });
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

/**
 * What one field of an order looked like before and after a correction.
 *
 * Both halves, always. The thing being overwritten is what the customer typed,
 * and a trail that keeps only the correction cannot answer the one question
 * worth asking of it later: what did they actually ask for.
 */
type Change = { from: string | number | null; to: string | number | null };

/**
 * Corrects the details on an order.
 *
 * Customers mistype, and until now the only cure was the Supabase table editor.
 * The date is the one that matters most — it is what the shop's whole week is
 * planned around — but the same form covers the email the confirmation went to,
 * the phone number, the address, and the allergies line.
 *
 * Three things it deliberately does not do:
 *
 * - **Re-check the calendar.** Lead time, the booking window and the day's
 *   capacity exist to stop a *customer* booking a day that cannot be baked. She
 *   is the person who decides what can be baked. The order page says out loud
 *   when a date is shut or oversubscribed and leaves the decision with her.
 * - **Email anybody.** A correction is usually made because the customer asked
 *   for it, so an automatic "your order has changed" would be telling them
 *   something they just said. "Send the latest email again", already on this
 *   page, is how they are told when they need to be.
 * - **Touch the lines or the money.** Quantities and prices are the order's
 *   history and re-pricing them is a different job, `saveOrderItems` below;
 *   the one exception is the
 *   delivery fee, which is not a price anyone chose but a consequence of
 *   pickup-or-delivery, so it moves when that does.
 */
export async function saveOrderDetails(_previous: State, formData: FormData): Promise<State> {
	await requireAdmin();

	const parsed = orderDetailsSchema.safeParse({
		id: formData.get("id") ?? "",
		...detailsFrom(formData),
	});

	if (!parsed.success) {
		const fieldErrors = fieldErrorsOf(parsed.error);
		return {
			result: actionError("Please check the highlighted fields and try again.", fieldErrors),
		};
	}

	const details = parsed.data;
	const order = await adminOrder(details.id);
	if (!order) return { result: actionError("That order no longer exists.") };

	// What the row is about to say, in the database's own names, so that the
	// comparison below and the update are reading one object rather than two
	// lists that have to be kept in step.
	const next = {
		pickup_date: details.pickupDate,
		pickup_time: details.pickupTime,
		fulfilment: details.fulfilment,
		customer_name: details.customerName,
		customer_email: details.customerEmail,
		customer_phone: details.customerPhone,
		delivery_address: details.deliveryAddress,
		notes: details.notes,
	};

	// `pickup_time` is "16:30:00" out of the column and "16:30" out of the form,
	// so the two are compared at the form's precision. Without this, opening the
	// form and saving it unchanged would log a change from half four to half
	// four, every time.
	const before: Record<keyof typeof next, string | number | null> = {
		pickup_date: order.pickupDate,
		pickup_time: order.pickupTime?.slice(0, 5) ?? null,
		fulfilment: order.fulfilment,
		customer_name: order.customerName,
		customer_email: order.customerEmail,
		customer_phone: order.customerPhone,
		delivery_address: order.deliveryAddress,
		notes: order.notes,
	};

	const changes: Record<string, Change> = {};
	for (const column of Object.keys(next) as Array<keyof typeof next>) {
		if (before[column] !== next[column]) {
			changes[column] = { from: before[column], to: next[column] };
		}
	}

	// The write itself: `next`, plus the delivery fee if the block below moves
	// it. Kept apart from `next` so the comparison above stays a comparison of
	// the eight fields she actually typed.
	const update: Database["public"]["Tables"]["orders"]["Update"] = { ...next };

	// The delivery fee is the one piece of money here, and it is not a price
	// anybody chose: it is what pickup-or-delivery costs. So it moves when that
	// does, and only when that does. An order placed as a delivery keeps the fee
	// it was quoted even if the shop's fee has changed since, because that is
	// what the customer was told they would pay.
	if (details.fulfilment !== order.fulfilment) {
		const fee = deliveryFeeFor(await getSettings(), details.fulfilment);

		if (fee !== order.deliveryFeeCents) {
			update.delivery_fee_cents = fee;
			update.total_cents = order.subtotalCents + fee + order.quoteCents;
			changes.delivery_fee_cents = { from: order.deliveryFeeCents, to: fee };
		}
	}

	if (Object.keys(changes).length === 0) return { result: actionOk() };

	const supabase = await createClient();
	const { error } = await supabase.from("orders").update(update).eq("id", order.id);

	if (error) {
		console.error("[vvbakes] could not save order details", error);
		return { result: actionError("That couldn't be saved. Please try again.") };
	}

	await supabase.from("order_events").insert({
		order_id: order.id,
		type: "details_edited",
		data: { changes },
	});

	revalidatePath("/admin/orders");
	revalidatePath(`/admin/orders/${order.id}`);
	revalidatePath("/admin");
	return { result: actionOk() };
}

/** The customer fields the details form and the new order form both send. */
function detailsFrom(formData: FormData) {
	return {
		pickupDate: String(formData.get("pickupDate") ?? ""),
		pickupTime: String(formData.get("pickupTime") ?? ""),
		fulfilment: String(formData.get("fulfilment") ?? "pickup"),
		customerName: String(formData.get("customerName") ?? ""),
		customerEmail: String(formData.get("customerEmail") ?? ""),
		customerPhone: String(formData.get("customerPhone") ?? ""),
		deliveryAddress: String(formData.get("deliveryAddress") ?? ""),
		notes: String(formData.get("notes") ?? ""),
	};
}

/**
 * What `edit_order_items` raises, said to her. Matched with `includes` in this
 * order, the way `orderErrorMessage` matches `place_order`'s.
 */
const ITEM_ERRORS: Record<string, string> = {
	QTY_INVALID:
		"One of those quantities can't be sold. Check it is a whole number the product comes in.",
	EMPTY_ORDER: "That would leave nothing on the order. If it is off, cancel it instead.",
	PRICE_ON_REQUEST: "A custom cake needs its brief and photos, so it can't be added here.",
	VARIANT_REQUIRED: "Pick a flavour for the line you're adding.",
	VARIANT_NOT_FOUND: "That flavour is no longer on the menu.",
	PRODUCT_NOT_FOUND:
		"One of those products is no longer on the menu, so it can't be priced. Its line can still be taken off.",
	LINE_NOT_FOUND: "This order changed somewhere else. Reload the page and try again.",
};

/** An `edit_order_items` or `admin_create_order` error, said to her. */
function itemError(error: { message: string }, what: string): string {
	const known = Object.entries(ITEM_ERRORS).find(([code]) => error.message.includes(code));
	if (!known) console.error(`[vvbakes] could not ${what}`, error);
	return known?.[1] ?? "That couldn't be saved. Please try again.";
}

/**
 * Changes what is on an order: a quantity, a line taken off, a line added.
 *
 * Everything that matters happens in `edit_order_items`, in one transaction:
 * which lines are priced again, the extras following their line, the total and
 * the trail. This only hands it the changes and says what went wrong. Like the
 * details correction, it emails nobody.
 */
export async function saveOrderItems(_previous: State, formData: FormData): Promise<State> {
	await requireAdmin();

	const id = String(formData.get("id") ?? "");
	let items: Json;
	try {
		items = JSON.parse(String(formData.get("items") ?? "[]")) as Json;
	} catch {
		return { result: actionError("That couldn't be saved. Please try again.") };
	}

	const supabase = await createClient();
	const { error } = await supabase.rpc("edit_order_items", { p_order_id: id, p_items: items });

	if (error) return { result: actionError(itemError(error, "change order items")) };

	revalidatePath("/admin/orders");
	revalidatePath(`/admin/orders/${id}`);
	revalidatePath("/admin");
	return { result: actionOk() };
}

/**
 * Puts in an order she took somewhere other than the shop: by text, by message,
 * across the counter.
 *
 * `admin_create_order` writes it and prices the lines the way "Change items"
 * prices a line added to any order, in one transaction. Like the corrections,
 * it checks no calendar and emails nobody; the order page's "Send the latest
 * email again" is how the customer hears, if she wants them to.
 */
export async function createOrder(_previous: State, formData: FormData): Promise<State> {
	await requireAdmin();

	const parsed = newOrderSchema.safeParse(detailsFrom(formData));
	if (!parsed.success) {
		return {
			result: actionError(
				"Please check the highlighted fields and try again.",
				fieldErrorsOf(parsed.error),
			),
		};
	}

	let items: Json;
	try {
		items = JSON.parse(String(formData.get("items") ?? "[]")) as Json;
	} catch {
		return { result: actionError("That couldn't be saved. Please try again.") };
	}
	if (!Array.isArray(items) || items.length === 0) {
		return { result: actionError("Add something off the menu first.") };
	}

	const details = parsed.data;
	const supabase = await createClient();
	const { data: id, error } = await supabase.rpc("admin_create_order", {
		p_items: items,
		p_pickup_date: details.pickupDate,
		p_pickup_time: details.pickupTime,
		p_fulfilment: details.fulfilment,
		p_customer_name: details.customerName,
		p_customer_email: details.customerEmail,
		p_customer_phone: details.customerPhone,
		p_delivery_address: details.deliveryAddress,
		p_notes: details.notes,
	});

	if (error || !id) {
		return {
			result: actionError(
				error ? itemError(error, "create an order") : "That couldn't be saved. Please try again.",
			),
		};
	}

	revalidatePath("/admin/orders");
	revalidatePath("/admin");
	redirect(`/admin/orders/${id}`);
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

	const template = EMAIL_FOR_STATUS[order.status] ?? "order-received";

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
