import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * An anonymous client with no cookies attached.
 *
 * `lib/supabase/server.ts` reads the request's cookies so a page renders as
 * whoever is signed in. That is right for anything serving a request, and
 * impossible anywhere there isn't one — `generateStaticParams` runs at build
 * time and throws if it so much as touches `cookies()`.
 *
 * This client is for those build-time reads. It carries no session, so row
 * level security treats it as an anonymous visitor, which is exactly what a
 * prerendered public page should see.
 */
export function createPublicClient() {
	return createSupabaseClient<Database>(supabaseUrl(), supabaseAnonKey(), {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}
