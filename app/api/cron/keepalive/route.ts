import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/supabase/env";

/**
 * Supabase pauses a free project after seven days without activity, which would
 * take the shop down without warning. A daily read keeps it awake.
 *
 * Vercel calls this on the schedule in vercel.json with CRON_SECRET as a bearer
 * token; without it the route is a 401 so it cannot be used to hammer the
 * database from outside.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const secret = process.env.CRON_SECRET;
	if (!secret) {
		return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
	}

	if (request.headers.get("authorization") !== `Bearer ${secret}`) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}

	if (!hasSupabaseConfig()) {
		return NextResponse.json({ ok: true, skipped: "supabase not configured" });
	}

	const supabase = createAdminClient();
	const { error } = await supabase.from("site_settings").select("id").limit(1);

	if (error) {
		return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
	}

	return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
