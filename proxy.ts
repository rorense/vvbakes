import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
	return updateSession(request);
}

export const config = {
	/*
	 * The admin only.
	 *
	 * `updateSession` calls `supabase.auth.getUser()`, which is a request to
	 * Supabase rather than a cookie read, and everything it then does with the
	 * answer is about /admin: refresh the owner's session, turn a signed-out
	 * visitor away, send a signed-in one past the login page. A stranger reading
	 * the menu has no session for any of that to be true of, so matching every
	 * path bought a round trip on the way to every public page and nothing else.
	 *
	 * This is the same trade lib/queries.ts already makes for the public reads,
	 * and for the same reason: the public site does not depend on who is asking.
	 * Every consumer of the session — lib/auth.ts, lib/admin-queries.ts, the
	 * admin's server actions, the image uploader — is reached through a path
	 * below, server actions included, because Next posts those back to the URL
	 * of the page that submitted them.
	 *
	 * The two entries are deliberate: `/admin/:path*` is written to match the
	 * bare `/admin` as well, but the gate on the dashboard is not a thing to
	 * leave resting on how a path matcher reads a trailing wildcard.
	 *
	 * The layout's own `requireAdmin()` is still the real boundary. This is the
	 * convenience in front of it.
	 */
	matcher: ["/admin", "/admin/:path*"],
};
