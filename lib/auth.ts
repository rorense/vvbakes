import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";
import { hasSupabaseConfig } from "./supabase/env";

export interface AdminUser {
	id: string;
	email: string;
}

/**
 * The signed-in owner, or null.
 *
 * Two questions, both of which have to be yes: is this a valid Supabase session,
 * and is that user in the `admins` table. Being able to sign in is not the same
 * as being the owner — sign-ups are disabled, but that is a setting, and a
 * setting is not an access control.
 */
export const getAdminUser = cache(async (): Promise<AdminUser | null> => {
	if (!hasSupabaseConfig()) return null;

	const supabase = await createClient();

	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return null;

	const { data, error } = await supabase.rpc("is_admin");
	if (error || data !== true) return null;

	return { id: user.id, email: user.email ?? "" };
});

/** Use at the top of every admin page. Redirects rather than returning null. */
export async function requireAdmin(): Promise<AdminUser> {
	const user = await getAdminUser();
	if (!user) redirect("/admin/login");
	return user;
}
