import "server-only";

import { createAdminClient } from "./supabase/admin";
import { hasSupabaseConfig } from "./supabase/env";

/**
 * Attempt counting, for the places anonymous traffic can reach.
 *
 * The database already refuses a fourth *order* from one address in a quarter
 * of an hour, but that counts rows in `orders`, so it only ever sees
 * submissions that made it all the way through. This counts the attempt, which
 * is what a bot actually generates, and it is checked before any of the
 * expensive work — the photo upload especially — is started.
 *
 * Deliberately not in memory. Every request is a fresh serverless invocation on
 * Vercel, so a module-level Map would be a counter per instance and no counter
 * at all in practice.
 *
 * What this does not stop: the request body has already been received and
 * parsed by the time a server action's own code runs, so a caller posting
 * megabytes of photos still costs the bandwidth even when the attempt is then
 * refused. What it stops is everything after that — storage writes, the RPC,
 * the emails.
 */

/** Which counter a call belongs to. */
export type RateLimitBucket = "order" | "login" | "feedback";

interface Rule {
	/** Attempts allowed inside the window. The one that trips it is refused. */
	limit: number;
	/** A Postgres interval literal. */
	window: string;
}

/**
 * The rules.
 *
 * `order` is set well above what a real customer does. Someone correcting a
 * typo, then a date that filled up, then their phone number, is three or four
 * submissions; ten in a quarter of an hour is not a person buying a cake.
 *
 * `login` is per address and is cleared the moment the right password arrives,
 * so it brakes a script guessing from one place without ever standing between
 * the owner and the dashboard. It is deliberately not keyed on the email
 * address: there is exactly one account, so an email-keyed counter would be a
 * lockout of the owner that anybody could trigger.
 */
const RULES: Record<RateLimitBucket, Rule> = {
	order: { limit: 10, window: "15 minutes" },
	login: { limit: 10, window: "15 minutes" },
	// The feedback form is behind an order's own token, so this is not really
	// keeping anyone out. It is a ceiling on what one machine can cost if a
	// token ever leaks. The row is overwritten rather than added to, so a
	// customer who rewrites their answer twice is well inside it.
	feedback: { limit: 10, window: "15 minutes" },
};

/**
 * Counts one attempt against `key` and says whether it may go ahead.
 *
 * Fails open, in both the senses that matter: a null key (no address to count,
 * which is what local development looks like) and a database that would not
 * answer both return true. A limiter that breaks must not be able to close the
 * shop.
 */
export async function recordAttempt(bucket: RateLimitBucket, key: string | null): Promise<boolean> {
	if (!key || !hasSupabaseConfig()) return true;

	const rule = RULES[bucket];

	try {
		const { data, error } = await createAdminClient().rpc("record_attempt", {
			p_bucket: bucket,
			p_key: key,
			p_limit: rule.limit,
			p_window: rule.window,
		});

		if (error) {
			console.error("[vvbakes] rate limit check failed", error);
			return true;
		}

		return data !== false;
	} catch (error) {
		console.error("[vvbakes] rate limit check threw", error);
		return true;
	}
}

/** Forgets a key's attempts. See `clear_attempts` for when that is right. */
export async function clearAttempts(bucket: RateLimitBucket, key: string | null): Promise<void> {
	if (!key || !hasSupabaseConfig()) return;

	try {
		await createAdminClient().rpc("clear_attempts", { p_bucket: bucket, p_key: key });
	} catch (error) {
		// Nothing the caller can do about it, and nothing they should hear.
		console.error("[vvbakes] could not clear rate limit attempts", error);
	}
}
