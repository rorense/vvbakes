import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseServiceRoleKey, supabaseUrl } from "./env";

/**
 * Service-role client. Bypasses row level security entirely.
 *
 * Only four things may use it, and each is a deliberate exception:
 *   1. `place_order`, orders have no insert policy for anyone, by design.
 *   2. The tokenised order status page, reads one order by an unguessable key.
 *   3. The keep-alive cron, one trivial read to stop the free tier pausing.
 *   4. Inspiration photos, written as part of placing an order so that the
 *      bucket has no anonymous insert policy of its own.
 *
 * Never pass data from this client to a client component without narrowing it
 * to exactly the fields that page is allowed to show.
 */
export function createAdminClient() {
	return createSupabaseClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
		auth: { persistSession: false, autoRefreshToken: false },
	});
}
