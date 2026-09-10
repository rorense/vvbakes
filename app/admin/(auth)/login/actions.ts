"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { actionError, type ActionResult } from "@/lib/types";

export interface LoginState {
	result: ActionResult | null;
}

/**
 * Signs the owner in.
 *
 * There is deliberately no sign-up, no password reset link and no "remember me":
 * one account exists, created by hand in the Supabase dashboard, and public
 * sign-ups are switched off there. Adding self-service flows would mean adding
 * ways in.
 */
export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
	if (!hasSupabaseConfig()) {
		return {
			result: actionError("Supabase isn't configured yet. Check the environment variables."),
		};
	}

	const email = String(formData.get("email") ?? "").trim();
	const password = String(formData.get("password") ?? "");
	const next = String(formData.get("next") ?? "/admin");

	if (!email || !password) {
		return { result: actionError("Enter your email and password.") };
	}

	const supabase = await createClient();
	const { error } = await supabase.auth.signInWithPassword({ email, password });

	if (error) {
		// Deliberately vague: saying which half was wrong tells an attacker
		// whether an address is a real account.
		return { result: actionError("That email or password isn't right.") };
	}

	// Only ever redirect inside the admin, so a crafted ?next= cannot bounce the
	// owner to another site straight after they authenticate.
	redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function signOut(): Promise<void> {
	const supabase = await createClient();
	await supabase.auth.signOut();
	redirect("/admin/login");
}
