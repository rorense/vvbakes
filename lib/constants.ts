/** Values that must exist before the database does, or that never change. */

export const SITE_NAME = "vvbakes";
export const SITE_TAGLINE = "Inspired Desserts";
const INSTAGRAM_HANDLE = "vv.bakes";
export const CART_STORAGE_KEY = "vvbakes:cart";

/** The order form rejects submissions faster than this, no human fills it in that quickly. */
export const MIN_FORM_FILL_MS = 3000;

/** Product image bucket. Public read, admin write. */
export const PRODUCT_IMAGE_BUCKET = "product-images";

/** Customer inspiration photos. Public read, written only by the server. */
export const INSPIRATION_IMAGE_BUCKET = "order-inspiration";

/**
 * How many inspiration photos one order may carry.
 *
 * Three covers what people actually send — a cake they saw, a colour, a
 * handwriting sample — and keeps the whole submission inside the body size
 * limit set in next.config.ts.
 */
export const MAX_INSPIRATION_PHOTOS = 3;

/**
 * The ceiling on one inspiration photo once the browser has re-encoded it.
 *
 * The uploader targets 0.4 MB, so this is a backstop against a caller that
 * skipped the compression step rather than a limit a real customer will meet.
 * The bucket enforces its own limit again on the way in.
 */
export const MAX_INSPIRATION_PHOTO_BYTES = 1_500_000;

/**
 * Whether search engines may list the public pages.
 *
 * Off until the shop is ready to be found. While it is off every page carries
 * `noindex, nofollow`, applied once on the root layout.
 *
 * robots.txt deliberately keeps letting crawlers in meanwhile. A `Disallow: /`
 * would stop them fetching the pages at all, so they would never read the tag,
 * and the bare URLs could still show up in results. Blocking the crawl and
 * blocking the listing are different things; only the tag does the second one.
 *
 * Flip to true to launch. Nothing else has to change.
 */
export const SEARCH_INDEXING: boolean = false;

/**
 * Canonical origin. Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every deploy, so
 * this resolves correctly before a custom domain exists.
 */
export function siteUrl(): string {
	const explicit = process.env.NEXT_PUBLIC_SITE_URL;
	if (explicit) return explicit.replace(/\/$/, "");

	const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
	if (vercel) return `https://${vercel}`;

	return "http://localhost:3000";
}

export function instagramUrl(handle: string = INSTAGRAM_HANDLE): string {
	return `https://www.instagram.com/${handle.replace(/^@/, "")}/`;
}
