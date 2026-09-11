"use server";

import { headers } from "next/headers";
import { orderErrorMessage } from "@/lib/availability";
import {
	INSPIRATION_IMAGE_BUCKET,
	MAX_INSPIRATION_PHOTOS,
	MAX_INSPIRATION_PHOTO_BYTES,
	MIN_FORM_FILL_MS,
} from "@/lib/constants";
import { todayIn } from "@/lib/dates";
import { sendOrderEmail } from "@/lib/email";
import { inspirationImagePath } from "@/lib/images";
import { toOrder } from "@/lib/mappers";
import { clientIp, getPrivateSettings, hashIp } from "@/lib/orders";
import { getSettings } from "@/lib/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import type { FormState } from "@/lib/action-state";
import { actionError, actionOk } from "@/lib/types";
import { fieldErrorsOf, orderInputSchema } from "@/lib/validation";

/** A placed order hands back the token the customer's status page lives at. */
type PlaceOrderState = FormState<{ token: string; reference: string }>;

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
		inspirationUrl: String(formData.get("inspirationUrl") ?? ""),
	});

	if (!parsed.success) {
		const fieldErrors = fieldErrorsOf(parsed.error);
		return fail(
			fieldErrors.items ?? "Please check the highlighted fields and try again.",
			fieldErrors,
		);
	}

	const input = parsed.data;

	// --- inspiration photos --------------------------------------------------
	// Uploaded before the order is written, because the row wants their paths.
	// If the order is then refused, they are swept up again below rather than
	// left behind in the bucket.
	const photos = await uploadPhotos(formData);
	if ("error" in photos) {
		return fail(photos.error, { inspirationPhotos: photos.error });
	}

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
		p_inspiration_image_paths: photos.paths,
		p_inspiration_url: input.inspirationUrl,
	});

	if (error) {
		await discardPhotos(photos.paths);
		// place_order raises named exceptions; anything else is ours, not theirs.
		const message = orderErrorMessage(error.message);
		if (message === "Something went wrong sending your order. Please try again.") {
			console.error("[vvbakes] place_order failed", error);
		}
		return fail(message);
	}

	const placed = Array.isArray(data) ? data[0] : data;
	if (!placed) {
		await discardPhotos(photos.paths);
		console.error("[vvbakes] place_order returned nothing");
		return fail("Something went wrong sending your order. Please try again.");
	}

	// --- notify --------------------------------------------------------------
	await notify(placed.id);

	return { result: actionOk({ token: placed.token, reference: placed.reference }) };
}

/**
 * What a photo may be, and what it is filed as. The bucket allows the same
 * three; the browser sends WebP unless it could not re-encode the original.
 */
const EXTENSIONS: Record<string, string> = {
	"image/webp": "webp",
	"image/jpeg": "jpg",
	"image/png": "png",
};

/**
 * Puts the customer's inspiration photos in the bucket.
 *
 * These arrive attached to the order itself rather than through an upload
 * endpoint of their own, which is the whole point: by the time this runs the
 * submission has already been through the honeypot, the timing check and, in
 * the database, the per-address rate limit. There is nothing here for an
 * anonymous visitor to call on its own.
 *
 * The browser re-encodes to WebP at around 400 KB first. The checks below are
 * for a caller that skipped that step, so they read as a wall rather than as
 * anything a real customer will meet.
 */
async function uploadPhotos(formData: FormData): Promise<{ paths: string[] } | { error: string }> {
	const files = formData
		.getAll("inspirationPhotos")
		.filter((entry): entry is File => entry instanceof File && entry.size > 0);

	if (files.length === 0) return { paths: [] };
	if (files.length > MAX_INSPIRATION_PHOTOS) {
		return { error: `Please send at most ${MAX_INSPIRATION_PHOTOS} photos.` };
	}

	for (const file of files) {
		if (!(file.type in EXTENSIONS)) {
			return { error: "Photos need to be a JPEG, PNG or WebP." };
		}
		if (file.size > MAX_INSPIRATION_PHOTO_BYTES) {
			return { error: "One of those photos is too big. Please try a smaller one." };
		}
	}

	const supabase = createAdminClient();
	const today = todayIn("UTC");
	const paths: string[] = [];

	for (const file of files) {
		const path = inspirationImagePath(today, EXTENSIONS[file.type]);
		const { error } = await supabase.storage
			.from(INSPIRATION_IMAGE_BUCKET)
			.upload(path, await file.arrayBuffer(), {
				contentType: file.type,
				cacheControl: "31536000",
				upsert: false,
			});

		if (error) {
			console.error("[vvbakes] inspiration upload failed", error);
			// Whatever did land is of no use without the order, so take it back out.
			await discardPhotos(paths);
			return { error: "Your photos didn't upload. Please try again, or leave them off." };
		}

		paths.push(path);
	}

	return { paths };
}

/** Removes uploaded photos again when the order they belong to never existed. */
async function discardPhotos(paths: string[]): Promise<void> {
	if (paths.length === 0) return;
	try {
		await createAdminClient().storage.from(INSPIRATION_IMAGE_BUCKET).remove(paths);
	} catch (error) {
		// An orphaned photo is litter, not a failure the customer should hear about.
		console.error("[vvbakes] could not remove orphaned inspiration photos", error);
	}
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
