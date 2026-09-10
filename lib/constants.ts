/** Values that must exist before the database does, or that never change. */

export const SITE_NAME = "vvbakes";
export const SITE_TAGLINE = "inspired desserts";
export const INSTAGRAM_HANDLE = "vv.bakes";
export const CART_STORAGE_KEY = "vvbakes:cart";

/** The order form rejects submissions faster than this — no human fills it in that quickly. */
export const MIN_FORM_FILL_MS = 3000;

/** Product image bucket. Public read, admin write. */
export const PRODUCT_IMAGE_BUCKET = "product-images";

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
