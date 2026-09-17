import "server-only";

import { addDays, todayIn, type IsoDate } from "./dates";
import { isEmailConfigured, sendOrderEmail } from "./email";
import { ORDER_SELECT, toOrder } from "./mappers";
import { getPrivateSettings } from "./orders";
import { getSettings } from "./queries";
import { createAdminClient } from "./supabase/admin";
import { hasSupabaseConfig } from "./supabase/env";

/**
 * Asking, once, how it went.
 *
 * Runs from the nightly cron, never from a page render. One order gets one
 * email, ever: `orders.feedback_requested_at` is stamped as it goes out and the
 * query only ever looks at nulls.
 *
 * Nothing here decides whether a thing may be published. It sends a link to a
 * form; the form records what they wrote and whether they ticked the box; she
 * decides the rest in the admin. See supabase/migrations/20260918000003_feedback.sql.
 */

/**
 * How long after the pickup date to ask.
 *
 * One day. Long enough that the cake has been eaten and short enough that the
 * day is still in mind. Anchored on the pickup date rather than on
 * `collected_at`, because the date is the thing the customer remembers and the
 * status is the thing she sometimes forgets to click.
 */
const ASK_AFTER_DAYS = 1;

/**
 * How far back the job will reach.
 *
 * This is the guard that matters. Without it, the first run after this ships
 * would find every collected order the shop has ever taken and email all of
 * them at once, months or years after the fact. That is not a feedback request,
 * it is a mailshot, and it is the kind of thing that gets a sending domain
 * marked as spam.
 *
 * Two weeks also means a cron that has been broken for a few days catches up
 * rather than starting again from today, and that an order collected while the
 * job was down is still worth asking about.
 */
const ASK_WITHIN_DAYS = 14;

/**
 * Which statuses count as "they have it".
 *
 * `collected` is certain. `ready` is included because she does not always come
 * back to press the last button, and an order she boxed up and whose date has
 * passed has almost always been picked up. `confirmed` is deliberately not
 * here: she never marked it ready, so there is nothing to say it was ever made,
 * and asking someone how their cake was when they never got one is worse than
 * not asking at all.
 *
 * `cancelled` is excluded for the same reason, and `new` has not even been
 * agreed to.
 */
const ASKABLE = ["collected", "ready"] as const;

/**
 * The ceiling on one run.
 *
 * Only ever reached the first time the job runs, or after an outage. Each send
 * is an HTTPS request to Resend inside a function with a sixty-second budget,
 * so the cap is what keeps a backlog from timing out halfway and losing the
 * stamps for everything it had not got to yet. Whatever is left is picked up
 * tomorrow, and the window above is fourteen days wide, so nothing falls off.
 */
const MAX_PER_RUN = 25;

export interface FeedbackRequestResult {
	ok: boolean;
	/** Set when the job decided there was nothing to do. Not a failure. */
	skipped?: string;
	/** Orders the window matched, before the cap. */
	due?: number;
	sent?: number;
	failed?: number;
	problems?: string[];
}

/** The window, as two dates. Exported for the test, which is the only other caller. */
export function askWindow(today: IsoDate): { from: IsoDate; to: IsoDate } {
	return { from: addDays(today, -ASK_WITHIN_DAYS), to: addDays(today, -ASK_AFTER_DAYS) };
}

export async function sendFeedbackRequests(): Promise<FeedbackRequestResult> {
	if (!hasSupabaseConfig() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
		return { ok: true, skipped: "supabase is not configured" };
	}

	// Checked before anything is read, because a send that is skipped rather
	// than attempted must not stamp the order: the stamp is what says "she has
	// asked", and a shop with no mail configured has not asked anybody.
	if (!isEmailConfigured()) {
		return { ok: true, skipped: "email is not configured" };
	}

	const [settings, privateSettings] = await Promise.all([getSettings(), getPrivateSettings()]);
	const { from, to } = askWindow(todayIn(settings.timezone));

	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("orders")
		.select(ORDER_SELECT)
		.is("feedback_requested_at", null)
		.in("status", [...ASKABLE])
		.gte("pickup_date", from)
		.lte("pickup_date", to)
		// Oldest first, so a backlog is worked through in the order it built up
		// and the one nearest falling out of the window goes first.
		.order("pickup_date", { ascending: true })
		.limit(MAX_PER_RUN);

	if (error) {
		return { ok: false, problems: [`could not read orders: ${error.message}`] };
	}

	const due = data ?? [];
	if (due.length === 0) return { ok: true, due: 0, sent: 0, failed: 0 };

	const problems: string[] = [];
	let sent = 0;
	let failed = 0;

	// One at a time rather than in parallel. Twenty-five is the worst case and
	// it only happens once; Resend's rate limit is not worth finding out about
	// on a shop's first run.
	for (const row of due) {
		const order = toOrder(row);

		const result = await sendOrderEmail({
			template: "feedback-request",
			order,
			settings,
			privateSettings,
		});

		if (result.sent) {
			sent += 1;
		} else {
			failed += 1;
			problems.push(`${order.reference}: ${result.error ?? result.skipped ?? "unknown error"}`);
		}

		// Stamped either way. A feedback request that bounced is not worth
		// chasing, and an order left unstamped would be tried again every night
		// until it aged out of the window. `sendOrderEmail` has already written
		// the failure to the order's trail, which is where it should be read.
		const { error: stampError } = await supabase
			.from("orders")
			.update({ feedback_requested_at: new Date().toISOString() })
			.eq("id", order.id);

		if (stampError) {
			// Worth saying loudly: this is the one failure that can repeat the
			// email, because tomorrow's run will find the order again.
			problems.push(`${order.reference}: sent but could not be stamped: ${stampError.message}`);
		}
	}

	return { ok: problems.length === 0, due: due.length, sent, failed, problems };
}
