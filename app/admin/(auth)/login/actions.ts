"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp, hashIp } from "@/lib/orders";
import { clearAttempts, recordAttempt } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import type { FormState } from "@/lib/action-state";
import { actionError } from "@/lib/types";

/**
 * Signs the owner in.
 *
 * There is deliberately no sign-up, no password reset link and no "remember me":
 * one account exists, created by hand in the Supabase dashboard, and public
 * sign-ups are switched off there. Adding self-service flows would mean adding
 * ways in.
 *
 * Guessing is braked per address, and getting it right clears the count. So a
 * script working through a word list from one machine runs out after ten tries,
 * while the owner who fat-fingers their password twice and then types it
 * correctly is back to zero and never notices the limit exists.
 *
 * Counting per *account* instead would be worse than useless here: with one
 * account on the whole system, anyone could lock the owner out of their own
 * shop by typing a wrong password often enough.
 */
export async function signIn(_previous: FormState, formData: FormData): Promise<FormState> {
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

	const ipHash = hashIp(clientIp(await headers()));
	if (!(await recordAttempt("login", ipHash))) {
		return {
			result: actionError("Too many sign-in attempts. Please wait a few minutes and try again."),
		};
	}

	const supabase = await createClient();
	const { error } = await supabase.auth.signInWithPassword({ email, password });

	if (error) {
		// Deliberately vague: saying which half was wrong tells an attacker
		// whether an address is a real account.
		return { result: actionError("That email or password isn't right.") };
	}

	await clearAttempts("login", ipHash);

	// Only ever redirect inside the admin, so a crafted ?next= cannot bounce the
	// owner to another site straight after they authenticate.
	redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function signOut(): Promise<void> {
	const supabase = await createClient();
	await supabase.auth.signOut();
	redirect("/admin/login");
}
