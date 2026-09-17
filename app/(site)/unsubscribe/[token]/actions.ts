"use server";

import { getOrderByToken } from "@/lib/orders";
import { recordOptOut } from "@/lib/unsubscribe";
import type { FormState } from "@/lib/action-state";
import { actionError, actionOk } from "@/lib/types";

/**
 * Takes somebody off the feedback list because they pressed the button.
 *
 * No honeypot, no fill-time floor, no rate limiter, unlike every other public
 * action here. Those exist to stop a bot creating something the shop then has
 * to deal with; this one creates a row saying "send this person less email",
 * which is not a thing worth defending against. What it must never do is refuse
 * a real person, so nothing here can turn one away.
 *
 * The token is the whole of the authorisation, matched to an order rather than
 * trusted, exactly as the feedback form does it. It arrived in an email sent to
 * the address it is about, so whoever holds it may speak for that address.
 */
export async function stopFeedbackEmails(
	_previous: FormState,
	formData: FormData,
): Promise<FormState> {
	const order = await getOrderByToken(String(formData.get("token") ?? ""));

	if (!order) {
		return {
			result: actionError(
				"That link has expired. Reply to the email and I'll take you off by hand.",
			),
		};
	}

	const saved = await recordOptOut(order, "link");

	if (!saved) {
		return {
			result: actionError(
				"That didn't save. Please try again, or reply to the email and I'll do it by hand.",
			),
		};
	}

	return { result: actionOk() };
}
