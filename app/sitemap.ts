import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/constants";
import { getProductSlugs } from "@/lib/queries";

/**
 * /menu and /order/[token] are deliberately absent: the first is the unlisted
 * market card, the second is private to whoever holds the link.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const base = siteUrl();
	// Built without a request, so this uses the cookie-free client.
	const slugs = await getProductSlugs();

	return [
		{ url: base, changeFrequency: "weekly", priority: 1 },
		{ url: `${base}/shop`, changeFrequency: "weekly", priority: 0.9 },
		{ url: `${base}/order`, changeFrequency: "monthly", priority: 0.8 },
		...slugs.map((slug) => ({
			url: `${base}/shop/${slug}`,
			changeFrequency: "weekly" as const,
			priority: 0.7,
		})),
	];
}
