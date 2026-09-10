"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Browser client, used only for the admin's image uploads to Storage. Everything
 * else on the site reads through server components, so the browser never needs a
 * database round trip.
 */
export function createClient() {
	return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}
