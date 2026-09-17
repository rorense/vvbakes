import { NextResponse } from "next/server";
import { sendFeedbackRequests } from "@/lib/feedback";

/**
 * Asks yesterday's customers how it went.
 *
 * Vercel calls this on the schedule in vercel.json with CRON_SECRET as a bearer
 * token, exactly like the two jobs beside it, so it cannot be used from outside
 * to make the shop email its own customers.
 *
 * Its own route rather than a step inside the Instagram sync, for the reason
 * the keep-alive is separate from both: this one sends mail to real people, and
 * it must not be able to fail, or fire twice, because Meta's API had a bad
 * morning.
 *
 * Safe to hit by hand. An order is stamped as it is asked and the query only
 * looks at unstamped ones, so a second run in the same minute sends nothing.
 */
export const dynamic = "force-dynamic";

/**
 * Twenty-five sends is the worst case, and only on the first run. Sixty seconds
 * is the ceiling on Vercel's Hobby plan; a run that hits it keeps every stamp
 * it had already written, so the rest are simply picked up tomorrow.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
	const secret = process.env.CRON_SECRET;
	if (!secret) {
		return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
	}

	if (request.headers.get("authorization") !== `Bearer ${secret}`) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}

	const result = await sendFeedbackRequests();

	if (!result.ok) {
		console.error("[vvbakes] feedback requests had problems", result.problems);
	}

	return NextResponse.json(
		{ ...result, at: new Date().toISOString() },
		{ status: result.ok ? 200 : 502 },
	);
}
