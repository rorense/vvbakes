import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/constants";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: "*",
			allow: "/",
			// /menu is the unlisted market card and /order/<token> pages are private
			// to whoever holds the link. Neither should be indexed.
			//
			// The rest stays allowed even before launch: SEARCH_INDEXING keeps the
			// pages out of results with a noindex tag, which a crawler can only obey
			// if it is still allowed to fetch the page and read it.
			disallow: ["/admin", "/admin/", "/menu", "/order/"],
		},
		sitemap: `${siteUrl()}/sitemap.xml`,
	};
}
