import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_NAME, siteUrl } from "@/lib/constants";
import { getCatalogue, getCategoryBySlug, getCategorySlugs, getSettings } from "@/lib/queries";
import { SITE_CITY, categoryJsonLd, categoryDescription } from "@/lib/seo";
import { ACCENT_BG } from "@/lib/types";
import { cn } from "@/lib/cn";
import { ButtonLink } from "@/components/ui/Button";
import { Container, Section } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { BreadcrumbJsonLd, type Crumb } from "@/components/site/BreadcrumbJsonLd";
import { JsonLd } from "@/components/site/JsonLd";
import { ProductCard } from "@/components/site/ProductCard";

// Same window as the rest of the public site, and for the reason written on
// the home page.
export const revalidate = 3600;

/**
 * Why these live under `/shop/category/` rather than `/shop/`.
 *
 * Because `/shop/<slug>` is already the product namespace, and the two sets of
 * slugs overlap: the live catalogue has a *category* called Cookies and a
 * *product* called Cookies, both slugged `cookies`, and the same for Cupcakes.
 * One of them would have to lose, and neither can. The extra segment is the
 * price of keeping every existing product URL working, which matters more than
 * its tidiness: those URLs are already in the sitemap.
 */
export async function generateStaticParams() {
	const slugs = await getCategorySlugs();
	return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<Metadata> {
	const { slug } = await params;
	const category = await getCategoryBySlug(slug);
	if (!category) return { title: "Not found" };

	// The whole reason this page exists: "Cupcakes in Auckland" is a query, and
	// until now the only thing the site offered it was the entire menu.
	return {
		title: { absolute: `${category.name} in ${SITE_CITY} | ${SITE_NAME}` },
		description: categoryDescription(category),
		alternates: { canonical: `/shop/category/${category.slug}` },
		openGraph: {
			type: "website",
			siteName: SITE_NAME,
			locale: "en_NZ",
			title: `${category.name} from ${SITE_NAME}`,
			description: categoryDescription(category),
			url: `${siteUrl()}/shop/category/${category.slug}`,
		},
	};
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const [category, catalogue, settings] = await Promise.all([
		getCategoryBySlug(slug),
		getCatalogue(),
		getSettings(),
	]);

	// A category with nothing in it is a 404 rather than an empty page. It has
	// nothing to rank for and nothing to show, and `getCatalogue` already drops
	// it from the menu, so a page for it would be the one place on the site
	// claiming it exists.
	if (!category || category.products.length === 0) notFound();

	const crumbs: Crumb[] = [
		{ name: "Shop", href: "/shop" },
		{ name: category.name, href: `/shop/category/${category.slug}` },
	];

	// The other categories, for the rail at the foot. Cheap internal linking:
	// every category page reaches every other one, so a crawler that finds any
	// of them finds them all.
	const siblings = catalogue.filter((other) => other.slug !== category.slug);

	return (
		<>
			<Section
				tone="paper"
				size="tight">
				<Container width="wide">
					<nav
						aria-label="Breadcrumb"
						className="text-cocoa-soft mb-8 text-xs">
						<ol className="flex flex-wrap items-center gap-2">
							{crumbs.map((crumb, index) => {
								const current = index === crumbs.length - 1;

								return (
									<Fragment key={crumb.href}>
										{index > 0 ? <li aria-hidden="true">/</li> : null}
										<li aria-current={current ? "page" : undefined}>
											{current ? (
												crumb.name
											) : (
												<Link
													href={crumb.href}
													className="underline-offset-4 hover:underline">
													{crumb.name}
												</Link>
											)}
										</li>
									</Fragment>
								);
							})}
						</ol>
					</nav>

					<div className="flex flex-col gap-4">
						<SectionLabel>Shop</SectionLabel>
						{/* The one H1 on the page, and it names the thing and the place,
						    because that is the query this page is here to answer. */}
						<h1
							className="text-4xl"
							style={{ fontVariationSettings: '"SOFT" 40, "WONK" 1' }}>
							{category.name} in {SITE_CITY}
						</h1>
						<p className="text-cocoa-soft max-w-2xl">{categoryDescription(category)}</p>
						{settings.leadTimeDays > 0 ? (
							<p className="text-cocoa-soft max-w-2xl text-sm">
								{`Please allow at least ${settings.leadTimeDays} day${settings.leadTimeDays === 1 ? "" : "s"} notice. Everything is baked fresh for the day you collect it.`}
							</p>
						) : null}
					</div>
				</Container>
			</Section>

			<section className={cn("py-14 sm:py-20", ACCENT_BG[category.accent])}>
				<Container width="wide">
					<div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
						{category.products.map((product, index) => (
							<ProductCard
								key={product.id}
								product={product}
								priority={index === 0}
								behind={category.accent}
							/>
						))}
					</div>
				</Container>
			</section>

			{siblings.length > 0 ? (
				<Section
					tone="paper"
					size="tight">
					<Container width="wide">
						<div className="flex flex-col gap-4">
							<SectionLabel as="h2">The rest of the menu</SectionLabel>
							<nav
								aria-label="Other categories"
								className="rail -mx-5 flex gap-2 px-5 sm:mx-0 sm:px-0">
								{siblings.map((other) => (
									<Link
										key={other.id}
										href={`/shop/category/${other.slug}`}
										className="border-line hover:border-cocoa hover:bg-paper-deep rounded-pill shrink-0 border px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors">
										{other.name}
									</Link>
								))}
								<Link
									href="/shop"
									className="border-line hover:border-cocoa hover:bg-paper-deep rounded-pill shrink-0 border px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors">
									Everything
								</Link>
							</nav>
						</div>
					</Container>
				</Section>
			) : null}

			<Section
				tone="blush"
				size="tight">
				<Container
					width="narrow"
					className="flex flex-col items-center gap-4 text-center">
					<p className="font-display text-2xl">Ready when you are</p>
					<p className="text-cocoa-soft text-sm">
						Put an order together and pick a day. I&rsquo;ll confirm by email.
					</p>
					<ButtonLink
						href="/order"
						size="lg">
						Start an order
					</ButtonLink>
				</Container>
			</Section>

			<BreadcrumbJsonLd crumbs={crumbs} />
			{/* A CollectionPage wrapping an ItemList of what is actually on it. The
			    products are linked rather than inlined, for the reason the shop
			    page's list links rather than inlines: each product page already
			    carries its own Product node. */}
			<JsonLd data={categoryJsonLd(category)} />
		</>
	);
}
