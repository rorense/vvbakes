import "server-only";

import { createAdminClient } from "./supabase/admin";
import { hasSupabaseConfig } from "./supabase/env";
import type { Order } from "./types";
import { normaliseEmail } from "./unsubscribe";

/**
 * The list of people who asked not to be sent feedback requests.
 *
 * Reads and writes `feedback_optouts`, which has no public read policy and no
 * insert policy for anybody, so everything here goes through the service role
 * from the server. That is what makes this half server-only and the half next
 * door in lib/unsubscribe.ts not.
 *
 * Keyed on the address rather than the order. Somebody who says "stop sending
 * me these" has not said it about one cake.
 */

export type OptOutSource = "link" | "one-click";

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
