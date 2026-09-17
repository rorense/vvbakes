"use server";

import { headers } from "next/headers";
import { MIN_FORM_FILL_MS } from "@/lib/constants";
import { clientIp, getOrderByToken, hashIp } from "@/lib/orders";
import { recordAttempt } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import type { FormState } from "@/lib/action-state";
import { actionError, actionOk } from "@/lib/types";
import { checkbox, feedbackSchema, fieldErrorsOf } from "@/lib/validation";

/**
 * Takes what a customer said about their order.
 *
 * Written with the service role, because `feedback` has no insert policy for
 * anyone, the same arrangement as `orders`. The token in the form is the whole
 * of the authorisation: it is matched to an order here rather than trusted, and
 * the row is keyed on that order, so a caller cannot attach words to somebody
 * else's cake by editing a hidden field.
 *
 * Nothing this writes reaches a public page. Consent is recorded and then sat
 * on until she reads it; see app/admin/(dashboard)/feedback.
 */
export async function submitFeedback(_previous: FormState, formData: FormData): Promise<FormState> {
	const fail = (error: string, fieldErrors?: Record<string, string>): FormState => ({
		result: actionError(error, fieldErrors),
	});

	// The same three brakes the order form has, in the same order. This one is
	// already behind an order's token so it is far less exposed, but the token
	// travels by email and email gets forwarded.
	if ((formData.get("website") as string | null)?.trim()) {
		return fail("That couldn't be sent. Please try again.");
	}

	const startedAt = Number(formData.get("startedAt"));
	if (startedAt > 0 && Date.now() - startedAt < MIN_FORM_FILL_MS) {
		return fail("That was quick. Have another read and send it again.");
	}

	if (!hasSupabaseConfig()) {
		return fail("This isn't switched on yet. Please reply to the email instead.");
	}

	const ipHash = hashIp(clientIp(await headers()));
	if (!(await recordAttempt("feedback", ipHash))) {
		return fail("That's a few tries in a row. Please wait a few minutes and try again.");
	}

	const order = await getOrderByToken(String(formData.get("token") ?? ""));
	if (!order) return fail("That link has expired. Please reply to the email instead.");

	// The page renders the form under the same condition. This is the check that
	// counts, because the page's is only what a browser was shown.
	if (order.status !== "collected" && order.status !== "ready") {
		return fail("There's nothing to look back on yet. This opens once your order is with you.");
	}

	const parsed = feedbackSchema.safeParse({
		author: String(formData.get("author") ?? ""),
		body: String(formData.get("body") ?? ""),
		consented: checkbox(formData, "consented"),
	});

	if (!parsed.success) {
		const fieldErrors = fieldErrorsOf(parsed.error);
		return fail(
			fieldErrors.body ?? fieldErrors.author ?? "Please check the boxes above and try again.",
			fieldErrors,
		);
	}

	const supabase = createAdminClient();

	// Upsert rather than insert. One order has one answer: somebody who comes
	// back to the link because they forgot to tick the box, or thought better of
	// what they wrote, is correcting it rather than adding a second opinion.
	const { error } = await supabase.from("feedback").upsert(
		{
			order_id: order.id,
			author: parsed.data.author,
			body: parsed.data.body,
			consented: parsed.data.consented,
			// A rewrite is un-published until she has read the new words. She
			// agreed to put the old ones up, not these.
			published_at: null,
		},
		{ onConflict: "order_id" },
	);

	if (error) {
		console.error("[vvbakes] could not save feedback", error);
		return fail("That couldn't be saved. Please try again in a moment.");
	}

	// Onto the order's own trail, so it is findable from the order rather than
	// only from the feedback list. Deliberately does not carry what they wrote:
	// `order_events` is an append-only log and a correction would leave the
	// first draft in it for ever.
	const { error: eventError } = await supabase.from("order_events").insert({
		order_id: order.id,
		type: "feedback_received",
		data: { consented: parsed.data.consented },
	});

	if (eventError) {
		// The feedback is saved, which is the thing that mattered.
		console.error("[vvbakes] could not record the feedback event", eventError);
	}

	return { result: actionOk() };
}
