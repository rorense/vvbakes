import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { syncInstagram } from "@/lib/instagram";

/**
 * Pulls the latest Instagram posts into our own tables and bucket.
 *
 * Vercel calls this on the schedule in vercel.json with CRON_SECRET as a bearer
 * token, exactly like the keep-alive beside it, so it cannot be used from
 * outside to make us hammer Meta's API.
 *
 * Kept separate from the keep-alive rather than folded into it, even though
 * both run daily, because the keep-alive is the one thing standing between a
 * free Supabase project and being paused. It must not be able to fail because
 * Instagram had a bad morning.
 *
 * Safe to hit by hand as often as you like: a post whose picture is already in
 * the bucket is not downloaded again, so a repeat run is a handful of upserts.
 */
export const dynamic = "force-dynamic";

/**
 * The first run downloads a dozen pictures and is the slow one; after that it
 * is usually one. Sixty seconds is the ceiling on Vercel's Hobby plan, and a
 * run that hits it still leaves every post it finished behind — see storePost.
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

	const result = await syncInstagram();

	// Only when something actually changed. The home page is on a five minute
	// timer anyway; this is so a new post is up within a minute of the sync
	// rather than waiting for the timer to come round.
	if (result.stored || result.pruned) {
		revalidatePath("/", "page");
	}

	if (!result.ok) {
		console.error("[vvbakes] Instagram sync had problems", result.problems);
	}

	return NextResponse.json(
		{ ...result, at: new Date().toISOString() },
		{ status: result.ok ? 200 : 502 },
	);
}
