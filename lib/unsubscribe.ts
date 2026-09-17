import "server-only";

import { createAdminClient } from "./supabase/admin";
import { hasSupabaseConfig } from "./supabase/env";
import type { Order } from "./types";

/**
 * Saying no to the feedback request, and being believed.
 *
 * Its own module rather than a corner of lib/email.ts, because three unrelated
 * places need parts of it and two of them must not pull the mailer in: the
 * unsubscribe page, the one-click route, and the mailer itself. lib/feedback.ts
 * imports the sentinel from here as well, which it could not do from
 * lib/email.ts without a cycle.
 *
 * Nothing here suppresses an order email. See the migration for why that is a
 * rule rather than an oversight.
 */

/**
 * What `sendOrderEmail` reports when it refused rather than failed.
 *
 * A string the two callers compare on, so the job can count an opt-out apart
 * from a bounce. Those mean opposite things: a bounce is an address that should
 * be looked at, this is the system working.
 */
export const OPTED_OUT = "unsubscribed";

/**
 * One spelling of an address, so two spellings cannot become two rows.
 *
 * Case and surrounding space only. The local part of an address is
 * case-sensitive by the letter of RFC 5321, but no mail provider anyone uses
 * treats it that way, and the failure mode of respecting it here is that
 * somebody who unsubscribed as `Alex@` keeps getting email as `alex@`. The
 * database checks the result, so a caller that skips this is refused rather
 * than quietly writing a duplicate.
 */
export function normaliseEmail(email: string): string {
	return email.trim().toLowerCase();
}

/**
 * The headers that put an unsubscribe button in the mail client itself.
 *
 * RFC 8058. `List-Unsubscribe-Post` is what turns the header from "here is a
 * link" into a button Gmail and Outlook draw at the top of the message, and it
 * commits us to acting on a POST to the URL without asking anything further.
 * That is safe precisely because it is a POST: corporate link scanners open
 * every URL in a message with GET, and a GET here does nothing but show a page.
 *
 * The mailto is a fallback for clients that ignore the first, and is left out
 * when the shop has no contact address on file rather than printing a dead one.
 *
 * Only ever attached to the feedback request. Putting it on an order
 * confirmation would offer to stop an email we would go on sending anyway.
 */
export function unsubscribeHeaders(options: {
	siteUrl: string;
	token: string;
	contactEmail?: string | null;
}): Record<string, string> {
	const url = `${options.siteUrl}/api/unsubscribe/${options.token}`;
	const targets = [`<${url}>`];

	if (options.contactEmail) {
		targets.push(`<mailto:${options.contactEmail}?subject=Unsubscribe>`);
	}

	return {
		"List-Unsubscribe": targets.join(", "),
		"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
	};
}

/**
 * Whether this address has asked not to be sent feedback requests.
 *
 * Fails open, and that is the deliberate half of it: a database that will not
 * answer means one more feedback request to somebody who asked for none, which
 * is a poor outcome, while failing closed means the job silently stops asking
 * anybody at all and nobody notices for a month. The first is visible and
 * recoverable, the second is not.
 */
export async function hasOptedOut(email: string): Promise<boolean> {
	if (!hasSupabaseConfig()) return false;

	try {
		const { data, error } = await createAdminClient()
			.from("feedback_optouts")
			.select("email")
			.eq("email", normaliseEmail(email))
			.maybeSingle();

		if (error) {
			console.error("[vvbakes] could not check the unsubscribe list", error);
			return false;
		}

		return data !== null;
	} catch (error) {
		console.error("[vvbakes] unsubscribe check threw", error);
		return false;
	}
}

export type OptOutSource = "link" | "one-click";

/**
 * Takes an address off the feedback list, and says so on the order's trail.
 *
 * Idempotent: pressing the button twice, or a mail client posting twice, leaves
 * one row with its original date. `ignoreDuplicates` rather than a merge,
 * because the first time somebody asked is the fact worth keeping.
 *
 * Returns false only when the write itself failed, which the callers turn into
 * "that did not save, please reply to the email instead". An unsubscribe that
 * silently did nothing is the one outcome worse than not offering one.
 */
export async function recordOptOut(order: Order, source: OptOutSource): Promise<boolean> {
	if (!hasSupabaseConfig()) return false;

	const supabase = createAdminClient();
	const email = normaliseEmail(order.customerEmail);

	const { error } = await supabase
		.from("feedback_optouts")
		.upsert({ email, order_id: order.id, source }, { onConflict: "email", ignoreDuplicates: true });

	if (error) {
		console.error("[vvbakes] could not record an unsubscribe", error);
		return false;
	}

	// A `note` rather than an email event, so it does not trip the "an email to
	// this customer did not send" banner on the order page. Nothing went wrong
	// here; somebody exercised a choice.
	const { error: eventError } = await supabase.from("order_events").insert({
		order_id: order.id,
		type: "note",
		data: { unsubscribed: true, source },
	});

	if (eventError) {
		// The opt-out is saved, which is the thing that had to happen.
		console.error("[vvbakes] could not record the unsubscribe event", eventError);
	}

	return true;
}
