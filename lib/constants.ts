/** Values that must exist before the database does, or that never change. */

export const SITE_NAME = "vvbakes";
export const SITE_TAGLINE = "inspired desserts";
const INSTAGRAM_HANDLE = "vv.bakes";
export const CART_STORAGE_KEY = "vvbakes:cart";

/**
 * The IndexedDB database holding inspiration photos until an order is placed.
 *
 * Separate from the cart's localStorage key because the two hold different
 * kinds of thing: the cart is a small JSON document, these are megabytes of
 * Blob. See lib/photo-store.ts for why they cannot share.
 */
export const PHOTO_STORE_NAME = "vvbakes:photos";
export const PHOTO_STORE_VERSION = 1;

/** The order form rejects submissions faster than this, no human fills it in that quickly. */
export const MIN_FORM_FILL_MS = 3000;

/** Product image bucket. Public read, admin write. */
export const PRODUCT_IMAGE_BUCKET = "product-images";

/** Customer inspiration photos. Public read, written only by the server. */
export const INSPIRATION_IMAGE_BUCKET = "order-inspiration";

/** Our copy of the Instagram pictures. Public read, written only by the cron. */
export const INSTAGRAM_IMAGE_BUCKET = "instagram";

/**
 * How many posts the feed keeps.
 *
 * Twelve is three rows of four on a desktop and six rows of two on a phone,
 * which is enough to read as "she posts regularly" and few enough that the
 * section does not become the page. Anything older is pruned on the next sync,
 * pictures included, so the bucket does not grow without end.
 */
export const INSTAGRAM_FEED_LIMIT = 12;

/**
 * How many inspiration photos one line of an order may carry.
 *
 * Three covers what people actually send — a cake they saw, a colour, a
 * handwriting sample. The brief belongs to the line now, so a basket with two
 * custom cakes in it may carry two sets of three.
 */
export const MAX_INSPIRATION_PHOTOS = 3;

/**
 * How many inspiration photos one whole order may carry, across every line.
 *
 * The per-line limit above is about what a brief needs; this one is about what
 * fits. Each photo is re-encoded to roughly 400 KB in the browser, and the
 * whole submission has to sit inside the 4 MB body limit set in next.config.ts
 * with the form fields around it. Six is two full briefs, which is already more
 * custom cakes than one order has ever held.
 */
export const MAX_ORDER_INSPIRATION_PHOTOS = 6;

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
