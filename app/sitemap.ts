import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/constants";
import { getCategorySlugs, getProductSlugs } from "@/lib/queries";

/**
 * /menu and /order/[token] are deliberately absent: the first is the unlisted
 * market card, the second is private to whoever holds the link.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const base = siteUrl();
	// Built without a request, so these use the cookie-free client.
	const [slugs, categories] = await Promise.all([getProductSlugs(), getCategorySlugs()]);

	return [
		{ url: base, changeFrequency: "weekly", priority: 1 },
		{ url: `${base}/shop`, changeFrequency: "weekly", priority: 0.9 },
		{ url: `${base}/order`, changeFrequency: "monthly", priority: 0.8 },
		// Above the products on purpose. A category page is the better answer to
		// "cupcakes Auckland" than any one cupcake, and the better landing page
		// for somebody still choosing.
		...categories.map((slug) => ({
			url: `${base}/shop/category/${slug}`,
			changeFrequency: "weekly" as const,
			priority: 0.8,
		})),
		...slugs.map((slug) => ({
			url: `${base}/shop/${slug}`,
			changeFrequency: "weekly" as const,
			priority: 0.7,
		})),
		// Listed so they can be found on their own, ranked last on purpose: nobody
		// is looking for the bakery by searching for its privacy policy.
		{ url: `${base}/terms`, changeFrequency: "yearly", priority: 0.2 },
		{ url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
	];
}
