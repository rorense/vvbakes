import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/constants";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: "*",
			allow: "/",
			// /menu is the unlisted market card and /order/<token> pages are private
			// to whoever holds the link. Neither should be indexed.
			disallow: ["/admin", "/admin/", "/menu", "/order/"],
		},
		sitemap: `${siteUrl()}/sitemap.xml`,
	};
}
