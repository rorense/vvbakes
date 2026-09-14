/**
 * The one rule both Vercel client scripts are held to.
 *
 * Kept out of the component and away from React so it can be tested directly:
 * it is the only thing standing between a customer's order token and a third
 * party's logs, which is not an invariant to leave resting on a code comment.
 */

/** Matches the token segment of a customer's order link, and nothing else. */
const ORDER_TOKEN_PATH = /^\/order\/[^/]+/;

/**
 * What Vercel is allowed to be told about a URL.
 *
 * Web Analytics and Speed Insights both report the real pathname alongside the
 * matched route, and two of this site's paths must not be reported the way they
 * are typed:
 *
 * - `/order/<token>` goes back to `/order/[token]`. That token is the only
 *   thing standing between a stranger and a customer's order, which is why the
 *   page is noindex; sending it would leave the same secret sitting in a
 *   dashboard. The visit still counts, the token just never leaves the browser.
 * - `/admin` and everything under it is dropped. Those are the owner's own
 *   visits rather than traffic, the paths carry order and product ids, and both
 *   products bill by the data point on the free plan.
 *
 * Returns the URL to report, or `null` for one that must not be sent at all.
 */
export function redactUrl(href: string): string | null {
	let url: URL;
	try {
		url = new URL(href);
	} catch {
		// A URL that will not parse cannot be checked against the rules above, so
		// drop it rather than assume it is safe.
		return null;
	}

	if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return null;

	if (ORDER_TOKEN_PATH.test(url.pathname)) {
		url.pathname = url.pathname.replace(ORDER_TOKEN_PATH, "/order/[token]");
		return url.toString();
	}

	return href;
}
