"use server";

import { headers } from "next/headers";
import { orderErrorMessage } from "@/lib/availability";
import {
	INSPIRATION_IMAGE_BUCKET,
	MAX_INSPIRATION_PHOTOS,
	MAX_INSPIRATION_PHOTO_BYTES,
	MAX_ORDER_INSPIRATION_PHOTOS,
	MIN_FORM_FILL_MS,
} from "@/lib/constants";
import { todayIn } from "@/lib/dates";
import { sendOrderEmail } from "@/lib/email";
import { inspirationImagePath } from "@/lib/images";
import { ORDER_SELECT, toOrder } from "@/lib/mappers";
import { clientIp, getPrivateSettings, hashIp } from "@/lib/orders";
import { getSettings } from "@/lib/queries";
import { recordAttempt } from "@/lib/rate-limit";
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
	// Three layers, cheapest first: a hidden field no person can see, a floor on
	// how fast the form can be completed, and a count of attempts from one
	// address. Between them these stop drive-by form spam without putting a
	// captcha in front of a customer buying cupcakes.
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

	// A third brake, and the one that catches what the other two miss. The
	// honeypot and the clock only see a single submission; this one sees the
	// tenth in a quarter of an hour from the same address, however well-formed
	// each of them looked.
	//
	// It runs here, before the body is parsed and well before a photo reaches
	// the bucket, because the point is to stop paying for the attempt rather
	// than to refuse it politely after the fact. The database keeps its own
	// separate count of orders that actually landed.
	const ipHash = hashIp(clientIp(await headers()));
	if (!(await recordAttempt("order", ipHash))) {
		return fail("That's a few tries in a row. Please wait a few minutes and try again.");
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
	// Uploaded before the order is written, because the rows want their paths.
	// If the order is then refused, they are swept up again below rather than
	// left behind in the bucket.
	//
	// Each line's photos arrive under a field named for that line's position in
	// `items`, so what comes back is keyed the same way.
	const photos = await uploadPhotos(formData, input.items.length);
	if ("error" in photos) {
		return fail(photos.error, { inspirationPhotos: photos.error });
	}

	// --- write ---------------------------------------------------------------
	const supabase = createAdminClient();

	const { data, error } = await supabase.rpc("place_order", {
		p_items: input.items.map((item, index) => ({
			product_id: item.productId,
			variant_id: item.variantId ?? null,
			// Sorted and de-duplicated again inside `place_order`, so whatever order
			// the picker handed these over in reaches the same line either way.
			extra_ids: item.extraIds ?? [],
			qty: item.qty,
			// The brief. `place_order` groups by these as well as by the flavour, so
			// two cakes described differently stay two lines.
			note: item.note ?? null,
			inspiration_url: item.inspirationUrl ?? null,
			inspiration_image_paths: photos.byLine.get(index) ?? [],
			custom_flavour: item.customFlavour ?? null,
			// Both are passed as they arrived. `place_order` blanks the text when
			// the box is ticked — they are one answer to one question — and it does
			// that before it groups, so a caller that sent both lands on the same
			// line as one that sent only the tick.
			frosting: item.frosting ?? null,
			frosting_matches_flavour: item.frostingMatchesFlavour ?? false,
		})),
		p_pickup_date: input.pickupDate,
		p_fulfilment: input.fulfilment,
		p_customer_name: input.customerName,
		p_customer_email: input.customerEmail,
		p_customer_phone: input.customerPhone,
		p_delivery_address: input.deliveryAddress ?? null,
		p_notes: input.notes ?? null,
		// The order-level brief is not asked for any more; it belongs to the line
		// that carries it. These two stay in the call because the function's
		// signature still has them, and the orders already holding one still read
		// from those columns.
		p_custom_request: null,
		p_ip_hash: ipHash,
		p_inspiration_image_paths: [],
		p_inspiration_url: null,
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

/** What `uploadPhotos` hands back: the paths, and which line each set belongs to. */
interface UploadedPhotos {
	/** Keyed by the line's position in `items`. Lines with no photos are absent. */
	byLine: Map<number, string[]>;
	/** Every path, flat, for sweeping up if the order is then refused. */
	paths: string[];
}

/**
 * Puts the customer's inspiration photos in the bucket.
 *
 * These arrive attached to the order itself rather than through an upload
 * endpoint of their own, which is the whole point: by the time this runs the
 * submission has already been through the honeypot, the timing check and the
 * per-address attempt limit. There is nothing here for an anonymous visitor to
 * call on its own, and nothing reaches the bucket until a caller has proved it
 * is not on its tenth try in a quarter of an hour.
 *
 * A brief belongs to a line now, so the files come in under `linePhotos:<n>`
 * where n is that line's position in the items array. The name is the only
 * thing tying a photo to the cake it describes, so an index naming no line is
 * refused rather than guessed at.
 *
 * The browser re-encodes to WebP at around 400 KB first. The checks below are
 * for a caller that skipped that step, so they read as a wall rather than as
 * anything a real customer will meet.
 */
async function uploadPhotos(
	formData: FormData,
	lineCount: number,
): Promise<UploadedPhotos | { error: string }> {
	/** The files for each line, in the order the browser appended them. */
	const wanted = new Map<number, File[]>();
	let total = 0;

	for (const [name, value] of formData.entries()) {
		const match = /^linePhotos:(\d+)$/.exec(name);
		if (!match) continue;
		if (!(value instanceof File) || value.size === 0) continue;

		const index = Number(match[1]);
		// A photo pointing at a line that is not in the order has nothing to
		// describe. That is a hand-made request rather than a customer, so it is
		// refused rather than quietly dropped.
		if (!Number.isInteger(index) || index < 0 || index >= lineCount) {
			return { error: "Your order couldn't be read. Please try again." };
		}

		if (!(value.type in EXTENSIONS)) {
			return { error: "Photos need to be a JPEG, PNG or WebP." };
		}
		if (value.size > MAX_INSPIRATION_PHOTO_BYTES) {
			return { error: "One of those photos is too big. Please try a smaller one." };
		}

		const forLine = wanted.get(index) ?? [];
		if (forLine.length >= MAX_INSPIRATION_PHOTOS) {
			return { error: `Please send at most ${MAX_INSPIRATION_PHOTOS} photos per item.` };
		}
		forLine.push(value);
		wanted.set(index, forLine);
		total += 1;
	}

	if (total === 0) return { byLine: new Map(), paths: [] };
	if (total > MAX_ORDER_INSPIRATION_PHOTOS) {
		return { error: `Please send at most ${MAX_ORDER_INSPIRATION_PHOTOS} photos in one order.` };
	}

	const supabase = createAdminClient();
	const today = todayIn("UTC");
	const byLine = new Map<number, string[]>();
	const paths: string[] = [];

	for (const [index, files] of wanted) {
		const forLine: string[] = [];

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

			forLine.push(path);
			paths.push(path);
		}

		byLine.set(index, forLine);
	}

	return { byLine, paths };
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
			.select(ORDER_SELECT)
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
