import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
	? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
	: undefined;

/**
 * Content Security Policy.
 *
 * This is the backstop behind the input validation, not a replacement for it:
 * if a product description or a customer's note ever did get rendered as markup
 * rather than text, this is what stops the injected script from running, from
 * reaching an attacker's server, or from repointing the order form somewhere
 * else.
 *
 * `'unsafe-inline'` on scripts is not an oversight. Next inlines the hydration
 * payload into the document on every request, and the alternative — a nonce
 * minted per request in middleware — makes every page dynamic, which on a menu
 * site that is almost entirely static is a real cost for a site with no
 * user-generated HTML anywhere in it.
 *
 * The less obvious entries:
 *   * `worker-src blob:` — browser-image-compression re-encodes inspiration
 *     photos in a worker built from a blob URL. Without this the photo picker
 *     silently stops compressing.
 *   * `img-src blob:` — the same picker previews the compressed file before it
 *     is sent.
 *   * `'unsafe-eval'` and `ws:` in development only, for the dev server's hot
 *     reload. Neither is ever sent in production.
 */
function contentSecurityPolicy(): string {
	const dev = process.env.NODE_ENV === "development";
	const supabase = supabaseHost ? `https://${supabaseHost}` : "";
	const supabaseSocket = supabaseHost ? `wss://${supabaseHost}` : "";

	const directives: Record<string, string[]> = {
		"default-src": ["'self'"],
		"script-src": [
			"'self'",
			"'unsafe-inline'",
			"https://va.vercel-scripts.com",
			dev ? "'unsafe-eval'" : "",
		],
		"style-src": ["'self'", "'unsafe-inline'"],
		"img-src": ["'self'", "data:", "blob:", supabase],
		"font-src": ["'self'", "data:"],
		"connect-src": [
			"'self'",
			supabase,
			supabaseSocket,
			"https://va.vercel-scripts.com",
			dev ? "ws:" : "",
		],
		"worker-src": ["'self'", "blob:"],
		"media-src": ["'self'"],
		"manifest-src": ["'self'"],
		// Nothing on this site embeds anything, and nothing may embed it.
		"frame-src": ["'none'"],
		"frame-ancestors": ["'none'"],
		"object-src": ["'none'"],
		// A form may only ever post back to us, and only a real <base> we wrote.
		"form-action": ["'self'"],
		"base-uri": ["'self'"],
	};

	return Object.entries(directives)
		.map(([name, values]) => `${name} ${values.filter(Boolean).join(" ")}`)
		.join("; ");
}

const nextConfig: NextConfig = {
	images: {
		remotePatterns: supabaseHost
			? [
					{
						protocol: "https",
						hostname: supabaseHost,
						pathname: "/storage/v1/object/public/**",
					},
				]
			: [],
		formats: ["image/webp"],
	},
	experimental: {
		serverActions: {
			// An order can carry three inspiration photos, re-encoded in the browser
			// to roughly 400 KB each. The 1 MB default would refuse the second one.
			bodySizeLimit: "4mb",
		},
		/**
		 * The client-side router cache, cut to the shortest window Next allows.
		 *
		 * Next keeps prefetched RSC payloads in the browser and reuses them for
		 * `<Link>` navigations — by default for 300 seconds on a static route.
		 * That timer runs in the visitor's own tab, where `revalidatePath()` cannot
		 * reach it, so a catalogue edit could be live on the server and still not
		 * show. Saving a product and then clicking through to the shop hit exactly
		 * that, and looked like the save itself being slow.
		 *
		 * This used to be zero, but Next refuses anything under 30 for `static`
		 * and warned on every build. Thirty is the floor. The owner's own tab is
		 * covered regardless: a server action that revalidates evicts the router
		 * cache in the tab that ran it. What is left is a visitor who prefetched
		 * a product page less than half a minute before a price changed, and who
		 * asks the server again on the next navigation after that. The server's
		 * answer is still a cached page, so this costs a request, not a database
		 * read.
		 */
		staleTimes: { static: 30, dynamic: 0 },
	},
	/**
	 * The share cards read the brand fonts and the logo off disk rather than
	 * importing them, so nothing in the module graph points at those files and
	 * tracing leaves them behind. A card for a product page or an order link is
	 * drawn on demand, not at build, and would find nothing to draw with.
	 */
	outputFileTracingIncludes: {
		"/opengraph-image": ["./assets/fonts/**", "./public/logo.png"],
		"/**/opengraph-image": ["./assets/fonts/**", "./public/logo.png"],
	},
	poweredByHeader: false,
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					{ key: "Content-Security-Policy", value: contentSecurityPolicy() },
					{ key: "X-Content-Type-Options", value: "nosniff" },
					{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
					// Kept alongside frame-ancestors for browsers that honour only one.
					{ key: "X-Frame-Options", value: "DENY" },
					// Nothing here asks for a camera, a microphone or a location.
					{
						key: "Permissions-Policy",
						value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()",
					},
				],
			},
		];
	},
};

export default nextConfig;
