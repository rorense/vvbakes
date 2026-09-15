import { siteUrl } from "@/lib/constants";

export type Crumb = {
	/** What the visitor reads, and what Google prints in the trail. */
	name: string;
	/** Site-root-relative path, e.g. "/shop" or "/shop/lapis-legit". */
	href: string;
};

/**
 * The trail Google prints in a result in place of the bare URL.
 *
 * The trail starts at Shop rather than the home page on purpose. Google asks
 * that the markup describe a path the visitor can actually see, and the visible
 * breadcrumb on a product page starts at Shop too. Pages that render both build
 * them from one array so the two cannot drift apart.
 *
 * Nothing is emitted for a trail of one. A lone crumb tells a crawler nothing
 * it did not already have from the URL, and a single-item list is the kind of
 * empty markup that earns a structured-data warning rather than a rich result.
 */
export function BreadcrumbJsonLd({ crumbs }: { crumbs: Crumb[] }) {
	if (crumbs.length < 2) return null;

	const base = siteUrl();

	const data = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: crumbs.map((crumb, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: crumb.name,
			item: `${base}${crumb.href}`,
		})),
	};

	return (
		<script
			type="application/ld+json"
			// Product and category names come from the admin catalogue, so JSON
			// escaping alone is not enough: JSON.stringify leaves "<" intact, and a
			// name holding "</script>" would close this tag early. \u003c is valid
			// inside a JSON string and parses back to the same text.
			dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\u003c") }}
		/>
	);
}
