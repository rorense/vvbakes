import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/constants";
import { readCatalogue } from "@/lib/queries";

/**
 * Built per request rather than at build time, which is not the obvious choice
 * for a file this static and is here because the obvious choice was silently
 * wrong.
 *
 * As a prerendered route this was generated once per build, and the Supabase
 * read behind it went through Next's persistent fetch cache. That cache lives
 * in `.next/cache`, which Vercel restores between deploys, so the response to
 * `products?select=slug` was answered from a build months earlier. On
 * 2026-09-22 the production build shipped a sitemap naming five products while
 * the shop had thirteen: the eight added since had pages, were linked, and
 * were absent from the one file whose whole job is to list them. Nothing
 * failed and nothing warned. Clearing `.next/cache/fetch-cache` and rebuilding
 * took it straight back to thirteen, which is what proved the cause.
 *
 * `force-dynamic` removes the prerendered artifact altogether, so there is no
 * build-time copy left to go stale and the fetches inside are uncached. A
 * sitemap is read by crawlers a few times a day and costs one catalogue read,
 * which is a price worth paying for a file that cannot quietly describe a shop
 * that no longer exists.
 *
 * /menu and /order/[token] are deliberately absent: the first is the unlisted
 * market card, the second is private to whoever holds the link.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const base = siteUrl();
	// The cookie-free client, because nothing here depends on who is asking. One
	// read gives both lists: every product sits in some group, an orphaned one in
	// "More treats", and only a category with something in it has a page.
	// `readCatalogue`, not `getCatalogue`: an unreachable database has to fail
	// this rather than list a shop with nothing in it.
	const catalogue = await readCatalogue();
	const categories = catalogue.map((category) => category.slug);
	const slugs = catalogue.flatMap((category) => category.products.map((product) => product.slug));

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
		// Listed so it can be found on its own, ranked last on purpose: nobody is
		// looking for the bakery by searching for its privacy policy. /terms is
		// absent because it is noindex, and a sitemap naming it would contradict that.
		{ url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.2 },
	];
}
