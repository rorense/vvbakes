import "server-only";

import { addDays, startOfDayIn, todayIn, type IsoDate } from "./dates";
import { isEmailConfigured, sendOrderEmail } from "./email";
import { ORDER_SELECT, toOrder } from "./mappers";
import { getPrivateSettings } from "./orders";
import { getSettings } from "./queries";
import { createAdminClient } from "./supabase/admin";
import { hasSupabaseConfig } from "./supabase/env";
import { OPTED_OUT } from "./unsubscribe";

/**
 * Asking, once, how it went.
 *
 * Runs from the nightly cron, never from a page render. One order gets one
 * email, ever: `orders.feedback_requested_at` is stamped as it goes out and the
 * query only ever looks at nulls.
 *
 * What starts the clock is her pressing "Mark collected", not the pickup date.
 * The two are usually the same day and sometimes are not: an order collected
 * late, or one she gets round to closing on Monday, should be asked about a day
 * after it actually changed hands rather than a day after the date somebody
 * typed into a form three weeks earlier.
 *
 * Nothing here decides whether a thing may be published. It sends a link to a
 * form; the form records what they wrote and whether they ticked the box; she
 * decides the rest in the admin. See supabase/migrations/20260918000003_feedback.sql.
 */

/**
 * How many days after collection to ask.
 *
 * One: the morning after the day the order was marked collected. Counted in
 * whole days in the bakery's own timezone rather than in hours, because the job
 * runs once a day and an hour count would read strangely against it. A
 * twenty-four hour rule would push an order collected on Tuesday morning past
 * Wednesday's run and into Thursday's, which is two days by anybody's reading.
 *
 * So: collected at any hour on Tuesday, asked on Wednesday's run.
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
 *
 * One thing it does not protect against, and cannot: a batch of old orders all
 * marked collected on the same afternoon is a batch of emails the next morning.
 * That is the right answer, since she has just said they all changed hands, but
 * it is worth knowing before a tidy-up session.
 */
const ASK_WITHIN_DAYS = 14;

/**
 * The one status that counts as "they have it".
 *
 * Collected, and nothing else. It is the only status in the whole flow that
 * somebody watched happen: she hands the box over and presses the button. Every
 * other candidate is a guess about the world from inside the database, and the
 * cost of guessing wrong here is asking a person how their cake was when they
 * never got one.
 *
 * The trade is real and worth knowing: an order she never marks collected is
 * never asked about. That is visible to her, because it sits in Ready in the
 * admin, and the button that closes it says what pressing it will do. See
 * TRANSITION_EFFECTS in lib/order-status.ts.
 */
const ASKABLE_STATUS = "collected" as const;

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
	/** Addresses on the unsubscribe list. Counted apart: not a failure. */
	optedOut?: number;
	failed?: number;
	problems?: string[];
}

/**
 * Which collections are due, as two instants.
 *
 * Half open: `from` is included, `until` is not. `until` is the moment today
 * began in the bakery's zone, so an order collected at any hour yesterday is
 * in and one collected five minutes ago is out, whatever the clock says in the
 * datacentre the job happens to run in.
 *
 * Exported for the test, which is the only other caller.
 */
export function askWindow(today: IsoDate, timezone: string): { from: string; until: string } {
	return {
		from: startOfDayIn(addDays(today, -ASK_WITHIN_DAYS), timezone),
		until: startOfDayIn(addDays(today, -(ASK_AFTER_DAYS - 1)), timezone),
	};
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
	const { from, until } = askWindow(todayIn(settings.timezone), settings.timezone);

	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("orders")
		.select(ORDER_SELECT)
		.is("feedback_requested_at", null)
		.eq("status", ASKABLE_STATUS)
		.gte("collected_at", from)
		.lt("collected_at", until)
		// Oldest first, so a backlog is worked through in the order it built up
		// and the one nearest falling out of the window goes first.
		.order("collected_at", { ascending: true })
		.limit(MAX_PER_RUN);

	if (error) {
		return { ok: false, problems: [`could not read orders: ${error.message}`] };
	}

	const due = data ?? [];
	if (due.length === 0) return { ok: true, due: 0, sent: 0, optedOut: 0, failed: 0 };

	const problems: string[] = [];
	let sent = 0;
	let optedOut = 0;
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
		} else if (result.skipped === OPTED_OUT) {
			// Somebody who asked not to be sent these. Counted, not reported: it
			// is the system doing what it was told, and a run that turns amber
			// every night because one customer unsubscribed in March is a run
			// nobody reads.
			optedOut += 1;
		} else {
			failed += 1;
			problems.push(`${order.reference}: ${result.error ?? result.skipped ?? "unknown error"}`);
		}

		// Stamped whatever happened, opt-outs included. A feedback request that
		// bounced is not worth chasing, and an order left unstamped would be
		// tried again every night until it aged out of the window.
		// `sendOrderEmail` has already written the outcome to the order's trail,
		// which is where it should be read.
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

	return { ok: problems.length === 0, due: due.length, sent, optedOut, failed, problems };
}
