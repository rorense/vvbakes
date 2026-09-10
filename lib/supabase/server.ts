import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Server client scoped to the current request's cookies, so it acts as the
 * signed-in owner inside the admin and as an anonymous visitor everywhere else.
 * Row level security does the rest.
 */
export async function createClient() {
	const cookieStore = await cookies();

	return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
		cookies: {
			getAll() {
				return cookieStore.getAll();
			},
			setAll(cookiesToSet) {
				try {
					for (const { name, value, options } of cookiesToSet) {
						cookieStore.set(name, value, options);
					}
				} catch {
					// Server components cannot set cookies. The proxy refreshes the
					// session on every request, so there is nothing to recover here.
				}
			},
		},
	});
}
