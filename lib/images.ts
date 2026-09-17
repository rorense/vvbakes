import {
	INSPIRATION_IMAGE_BUCKET,
	INSTAGRAM_IMAGE_BUCKET,
	PRODUCT_IMAGE_BUCKET,
} from "./constants";
import type { Accent, Product, ProductOption, ProductVariant } from "./types";

/**
 * Public URL for an object in one of the image buckets.
 *
 * Built by hand rather than through `supabase.storage.getPublicUrl` so it works
 * in server components without a client, and so `next/image` can be given a
 * stable URL at render time.
 */
function storageUrl(bucket: string, path: string | null): string | null {
	if (!path) return null;
	const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
	if (!base) return null;
	const encoded = path.split("/").map(encodeURIComponent).join("/");
	return `${base.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${encoded}`;
}

export function productImageUrl(path: string | null): string | null {
	return storageUrl(PRODUCT_IMAGE_BUCKET, path);
}

/**
 * A customer's inspiration photo.
 *
 * The bucket is public, like the product one, and the path is unguessable. That
 * is the same bargain the order status page already makes: a link nobody can
 * derive is what keeps one customer's order away from the next.
 */
export function inspirationImageUrl(path: string | null): string | null {
	return storageUrl(INSPIRATION_IMAGE_BUCKET, path);
}

/**
 * Our copy of one Instagram picture.
 *
 * Public, like the others, because the feed is on the home page and next/image
 * cannot follow a signed URL. Nothing is hidden here anyway: every one of these
 * is already a public post on Instagram.
 */
export function instagramImageUrl(path: string | null): string | null {
	return storageUrl(INSTAGRAM_IMAGE_BUCKET, path);
}

/**
 * Where one Instagram picture lands.
 *
 * Named after the media id rather than randomly, so re-syncing a post
 * overwrites its own file instead of leaving the old one orphaned in the
 * bucket. The extension follows what Instagram actually served, since their
 * CDN returns JPEG for photos and for video thumbnails alike but is not
 * promising to forever.
 */
export function instagramImagePath(mediaId: string, extension = "jpg"): string {
	return `${mediaId.replace(/[^A-Za-z0-9_-]/g, "")}.${extension}`;
}

/** A stable object path for a newly uploaded image. */
export function productImagePath(productSlug: string, extension = "webp"): string {
	return `${productSlug}/${randomName(extension)}`;
}

/**
 * Where one inspiration photo lands.
 *
 * Grouped by the day it arrived rather than by order: the path has to be minted
 * before `place_order` runs, so there is no order id to file it under yet, and
 * a date prefix at least makes the bucket browsable when something needs
 * clearing out by hand.
 */
export function inspirationImagePath(today: string, extension = "webp"): string {
	return `${today}/${randomName(extension)}`;
}

function randomName(extension: string): string {
	const stamp = Date.now().toString(36);
	const random = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
	return `${stamp}-${random}.${extension}`;
}

const ACCENT_CYCLE: Accent[] = ["rose", "butter", "mint", "peach", "blush"];

/**
 * The pastel a product falls back to when it has no photo yet.
 *
 * Derived from the slug so a product keeps the same colour between renders, and
 * never the colour of the band it is sitting on, a mint tile on a mint band is
 * an invisible card, which is exactly what a missing photo must not look like.
 */
export function fallbackAccent(product: Pick<Product, "slug">, behind?: Accent | null): Accent {
	const palette = behind ? ACCENT_CYCLE.filter((accent) => accent !== behind) : ACCENT_CYCLE;

	let hash = 0;
	for (const char of product.slug) {
		hash = (hash * 31 + char.charCodeAt(0)) % 9973;
	}
	return palette[hash % palette.length]!;
}

/** Alt text for a product photo, falling back to something descriptive. */
function productImageAlt(product: Pick<Product, "name" | "imageAlt">): string {
	return product.imageAlt?.trim() || `${product.name} from vvbakes`;
}

/**
 * The photo a chosen combination actually shows.
 *
 * Three places can supply one, and they are tried from most specific to least:
 * the combination's own, then the answers it is made of, then the product's. A
 * product that asks two questions puts the photo on the flavour rather than on
 * all nine rows, so it is the answer that usually wins; the combination's own
 * is still there for the one row that deserves its own picture.
 */
export function variantImagePath(
	product: Pick<Product, "imagePath">,
	variant: Pick<ProductVariant, "imagePath"> | null,
	options: ReadonlyArray<Pick<ProductOption, "imagePath">> = [],
): string | null {
	return (
		variant?.imagePath ?? options.find((option) => option.imagePath)?.imagePath ?? product.imagePath
	);
}

/**
 * Alt text for whichever photo a variant actually ends up showing.
 *
 * A variant showing a photo of its own does not get the product's alt text:
 * that sentence describes the product's picture, and this is a different
 * picture. The variant name is the only thing that separates them, so it is
 * what the sentence is built from. A variant falling back to the product's
 * photo gets the product's words with it.
 */
export function variantImageAlt(
	product: Pick<Product, "name" | "imageAlt" | "imagePath">,
	variant: Pick<ProductVariant, "name" | "imagePath"> | null,
	options: ReadonlyArray<Pick<ProductOption, "imagePath">> = [],
): string {
	if (!variant) return productImageAlt(product);

	const shown = variantImagePath(product, variant, options);
	if (!shown || shown === product.imagePath) return productImageAlt(product);
	return `${product.name}, ${variant.name}, from vvbakes`;
}
