import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { hasSupabaseConfig, supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Refreshes the Supabase session cookie on every request and turns unauthenticated
 * visitors away from /admin.
 *
 * This is a convenience, not the security boundary. The real gate is
 * `requireAdmin()` inside the admin layout, plus row level security on every
 * table — middleware alone has historically been the wrong place to trust.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
	// Server components can read request headers but not the request URL, and the
	// admin shell needs the current path to highlight a tab. Adding it to the
	// *request* headers is what makes it visible to `headers()` downstream;
	// setting it on the response would only reach the browser.
	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-current-path", request.nextUrl.pathname);

	const withPath = () => NextResponse.next({ request: { headers: requestHeaders } });

	let response = withPath();

	if (!hasSupabaseConfig()) return response;

	const supabase = createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
		cookies: {
			getAll() {
				return request.cookies.getAll();
			},
			setAll(cookiesToSet) {
				for (const { name, value } of cookiesToSet) {
					request.cookies.set(name, value);
				}
				response = withPath();
				for (const { name, value, options } of cookiesToSet) {
					response.cookies.set(name, value, options);
				}
			},
		},
	});

	// getUser() revalidates the token with Supabase. getSession() only reads the
	// cookie, which a client could have forged.
	const {
		data: { user },
	} = await supabase.auth.getUser();

	const { pathname } = request.nextUrl;
	const isAdminRoute = pathname.startsWith("/admin");
	const isLoginRoute = pathname === "/admin/login";

	if (isAdminRoute && !isLoginRoute && !user) {
		const url = request.nextUrl.clone();
		url.pathname = "/admin/login";
		// Come back here after signing in.
		url.searchParams.set("next", pathname);
		return NextResponse.redirect(url);
	}

	if (isLoginRoute && user) {
		const url = request.nextUrl.clone();
		url.pathname = "/admin";
		url.search = "";
		return NextResponse.redirect(url);
	}

	return response;
}
