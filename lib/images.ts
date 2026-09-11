import { PRODUCT_IMAGE_BUCKET } from "./constants";
import type { Accent, Product } from "./types";

/**
 * Public URL for an object in the product image bucket.
 *
 * Built by hand rather than through `supabase.storage.getPublicUrl` so it works
 * in server components without a client, and so `next/image` can be given a
 * stable URL at render time.
 */
export function productImageUrl(path: string | null): string | null {
	if (!path) return null;
	const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
	if (!base) return null;
	const encoded = path.split("/").map(encodeURIComponent).join("/");
	return `${base.replace(/\/$/, "")}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${encoded}`;
}

/** A stable object path for a newly uploaded image. */
export function productImagePath(productSlug: string, extension = "webp"): string {
	const stamp = Date.now().toString(36);
	const random = Math.random().toString(36).slice(2, 8);
	return `${productSlug}/${stamp}-${random}.${extension}`;
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
export function productImageAlt(product: Pick<Product, "name" | "imageAlt">): string {
	return product.imageAlt?.trim() || `${product.name} from vvbakes`;
}
