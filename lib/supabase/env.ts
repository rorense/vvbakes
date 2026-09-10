/**
 * Environment access with a clear failure message.
 *
 * A missing Supabase key otherwise surfaces as "Invalid URL" or a silent 401
 * halfway through a render, which is a miserable thing to debug on a Friday.
 */

function required(name: string, value: string | undefined): string {
	if (!value) {
		throw new Error(
			`Missing ${name}. Copy .env.example to .env.local and fill it in, or set it in the Vercel project settings.`,
		);
	}
	return value;
}

export function supabaseUrl(): string {
	return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string {
	return required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function supabaseServiceRoleKey(): string {
	return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** True when Supabase is configured at all. Lets pages degrade instead of crash. */
export function hasSupabaseConfig(): boolean {
	return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
