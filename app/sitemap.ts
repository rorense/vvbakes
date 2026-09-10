import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/constants";
import { getProducts } from "@/lib/queries";

/**
 * /menu and /order/[token] are deliberately absent: the first is the unlisted
 * market card, the second is private to whoever holds the link.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const base = siteUrl();
	const products = await getProducts();

	return [
		{ url: base, changeFrequency: "weekly", priority: 1 },
		{ url: `${base}/shop`, changeFrequency: "weekly", priority: 0.9 },
		{ url: `${base}/order`, changeFrequency: "monthly", priority: 0.8 },
		...products.map((product) => ({
			url: `${base}/shop/${product.slug}`,
			changeFrequency: "weekly" as const,
			priority: 0.7,
		})),
	];
}
