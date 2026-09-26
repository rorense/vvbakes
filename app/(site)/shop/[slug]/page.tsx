import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_NAME, siteUrl } from "@/lib/constants";
import { productImageUrl } from "@/lib/images";
import { afterMinimumRows, formatPrice } from "@/lib/pricing";
import {
	getCategories,
	getProductBySlug,
	getProductRatings,
	getProductSlugs,
	getSettings,
} from "@/lib/queries";
import { SITE_CITY, localityLine, productDescription, productJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/site/JsonLd";
import { Container, Section } from "@/components/ui/Container";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { ArchFrame } from "@/components/ui/ArchFrame";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { BreadcrumbJsonLd, type Crumb } from "@/components/site/BreadcrumbJsonLd";
import { AddToOrder } from "@/components/order/AddToOrder";
import {
	VariantAllergens,
	VariantChoiceProvider,
	VariantGallery,
	VariantPhoto,
} from "@/components/order/VariantChoice";

// Same window as the home page, and for the reason written there.
export const revalidate = 3600;

/**
 * There is deliberately no `loading.tsx` beside this file, and there used to
 * be one.
 *
 * A loading file is a Suspense boundary, and a Suspense boundary makes the
 * route stream: the response status is committed and sent before this function
 * has decided anything, so the `notFound()` below could no longer change it.
 * Every missing product answered HTTP 200 carrying the not-found page, which
 * is a soft 404 — Google crawls the URL, works out it is missing from the
 * words rather than the status, and spends the budget anyway. Confirmed on
 * 2026-09-22 by moving the two files aside and rebuilding, which turned bad
 * slugs into real 404s and left good ones untouched.
 *
 * Losing the skeleton costs almost nothing here, which is what made the trade
 * easy. Every real product is prerendered by `generateStaticParams`, and an
 * expired one is served stale while it regenerates behind the visitor, so the
 * skeleton was only ever shown for a slug that is not in the build: a product
 * added since the last deploy, or one that does not exist. The second of those
 * is exactly the case that needs the 404.
 *
 * The same reasoning removed `app/(site)/shop/loading.tsx`, which covered this
 * route's siblings including the category pages.
 */
export async function generateStaticParams() {
	const slugs = await getProductSlugs();
	return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<Metadata> {
	const { slug } = await params;
	const product = await getProductBySlug(slug);
	if (!product) {
		// Matches the title the not-found page itself sets. Next resolves metadata
		// before the page calls notFound(), so a different wording here showed up
		// as the tab title changing under the visitor on a client navigation.
		return { title: "Page not found" };
	}

	// The template turns this into "Lapis Legit | vvbakes", which is right for a
	// page somebody reaches from the menu and useless to somebody searching for
	// the thing itself. The city goes in the title rather than only the
	// description, because a product name plus a place is the whole query.
	const title = `${product.name} | ${SITE_CITY} | ${SITE_NAME}`;
	const description = productDescription(product);

	return {
		title: { absolute: title },
		description,
		alternates: { canonical: `/shop/${product.slug}` },
		// Metadata is merged a field at a time, not deeply, so an `openGraph`
		// declared here replaces the root layout's outright rather than adding to
		// it. The three site-wide values have to be repeated or every product page
		// ships without them.
		//
		// `images` is deliberately absent: opengraph-image.tsx next door draws the
		// card. Naming the key here at all, even as undefined, is enough for Next
		// to treat the images as declared and skip that file.
		openGraph: {
			type: "website",
			siteName: SITE_NAME,
			locale: "en_NZ",
			title: `${product.name} from ${SITE_NAME}`,
			description,
			url: `${siteUrl()}/shop/${product.slug}`,
		},
	};
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const [product, categories, settings, ratings] = await Promise.all([
		getProductBySlug(slug),
		getCategories(),
		getSettings(),
		getProductRatings(),
	]);

	if (!product) notFound();

	const category = categories.find((c) => c.id === product.categoryId) ?? null;

	// "First two boxes (total)" and "Additional box" for the minis; null for
	// every product not priced that way.
	const afterMinimum = afterMinimumRows(product);

	// One array drives both the visible trail and the structured data below it.
	// Google wants the markup to describe the path a visitor can see, so the two
	// are built from the same source rather than written out twice.
	// The middle crumb points at the category's own page now rather than at an
	// anchor on the shop page. Google asks that the markup describe a path the
	// visitor can walk, and a trail whose middle step is a jump back to the same
	// list the visitor came from was the weaker reading of that even when it was
	// the only one available.
	const crumbs: Crumb[] = [
		{ name: "Shop", href: "/shop" },
		...(category ? [{ name: category.name, href: `/shop/category/${category.slug}` }] : []),
		{ name: product.name, href: `/shop/${product.slug}` },
	];

	// Main photo first, then the strip under it, because Google takes the first
	// one it can crop and the main photo is the one chosen to represent the
	// product. Paths with no bucket configured come back null and drop out.
	const images = [product.imagePath, ...product.galleryImagePaths]
		.map(productImageUrl)
		.filter((url): url is string => url !== null);

	return (
		<Section
			tone="paper"
			size="tight">
			<Container width="wide">
				<nav
					aria-label="Breadcrumb"
					className="text-cocoa-soft mb-8 text-xs">
					<ol className="flex flex-wrap items-center gap-2">
						{crumbs.map((crumb, index) => {
							// The page you are on is named, not linked.
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
				<BreadcrumbJsonLd crumbs={crumbs} />

				{/* The product as a product, which is what earns a price and a stock
				    state in the result rather than a blue link. The offer's `seller`
				    points at the bakery `@id` the home page publishes, so the two
				    pages describe one business instead of two.

				    A product priced on request publishes no price at all unless it
				    has a price guide, in which case only the floor goes out. See
				    `offerPrices` in lib/seo.ts: quoting the placeholder sitting in
				    `unitPriceCents` would put a number in Google that this very page
				    refuses to show a customer. */}
				<JsonLd
					data={productJsonLd({
						product,
						category,
						images,
						description: productDescription(product),
						rating: ratings.get(product.id) ?? null,
					})}
				/>

				{/* The photo and the picker sit in opposite columns and have to agree
				    on which variant is showing, so the choice lives in a provider
				    around both rather than inside either. Everything between them is
				    still rendered on the server. */}
				<VariantChoiceProvider product={product}>
					<div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
						{/* The strip only appears on a product with more than one photo,
						    and it decides that for itself, so there is no second copy of
						    the rule here to fall out of step with it. */}
						<div className="flex flex-col gap-3">
							<ArchFrame
								tone="blush"
								className="relative aspect-4/5 w-full">
								<VariantPhoto
									product={product}
									sizes="(min-width: 1024px) 45vw, 100vw"
									priority
								/>
							</ArchFrame>
							<VariantGallery product={product} />
						</div>

						{/* The right column is laid out as a menu card: name, note, a
						    hairline price table, then the quantity control. */}
						<div className="flex flex-col gap-6">
							<div className="flex flex-col gap-3">
								<h1
									className="text-4xl"
									style={{ fontVariationSettings: '"SOFT" 40, "WONK" 1' }}>
									{product.name}
								</h1>
								{product.description ? (
									<p className="text-cocoa-soft text-lg">{product.description}</p>
								) : null}
							</div>

							{/* The price table says what the pickers below do not.
							    A flavoured product prices itself as the customer chooses:
							    the pills and the running total under them move together, so
							    a table repeating "$45" once per flavour was a second answer
							    to a question already answered. What is left is the plain
							    per-unit price, which nothing else states, and the bundles,
							    which the pickers never mention.

							    A product priced on request has none of that to say. Every
							    row here would be quoting the placeholder sitting in
							    `unitPriceCents`, so the whole table gives way to what it can
							    say: where its prices start, if she has said, and otherwise
							    the one line that is actually true.

							    The guide is a guide. Nothing is priced from it, and the line
							    still totals zero until she quotes it, so the sentence under
							    it has to go on saying that a real number is coming. */}
							{product.priceOnRequest ? (
								<div className="flex flex-col gap-2">
									<SectionLabel as="h2">Price</SectionLabel>
									{product.priceGuide.length > 0 ? (
										<>
											<HairlineList as="dl">
												{product.priceGuide.map((row) => (
													<HairlineRow
														key={row.label}
														as="div">
														<dt className="text-sm">{row.label}</dt>
														<dd className="font-display text-lg italic">
															{row.isAddition ? "+ " : "from "}
															{formatPrice(row.priceCents)}
														</dd>
													</HairlineRow>
												))}
											</HairlineList>
											{product.priceGuideNote ? (
												<p className="text-cocoa-soft text-sm">{product.priceGuideNote}</p>
											) : null}
											<p className="text-cocoa-soft text-sm">
												Where a cake like that starts, not a quote. Tell me below what you&rsquo;re
												after and I&rsquo;ll come back to you with the real number and where to send
												it.
											</p>
										</>
									) : (
										<p className="text-cocoa-soft text-sm">
											It depends on the size and how much work goes on top, so I price it once I
											know what you&rsquo;re after. Tell me below and I&rsquo;ll come back to you
											with a number and where to send it.
										</p>
									)}
								</div>
							) : product.variants.length === 0 ||
							  product.tiers.length > 0 ||
							  product.extraUnitPriceCents !== null ? (
								<div className="flex flex-col gap-2">
									<SectionLabel as="h2">Price</SectionLabel>
									<HairlineList as="dl">
										{/* Sold by the flavour, the per-unit row is normally skipped:
										    the pills carry the prices and a single number here could
										    only be one of them. A product with a cheaper rate past the
										    minimum is the exception, because the row underneath makes
										    no sense on its own: "Additional box $15" with no price for
										    the first two beside it reads as the whole price. */}
										{product.variants.length === 0 || afterMinimum ? (
											<HairlineRow as="div">
												<dt className="text-sm">
													{afterMinimum
														? afterMinimum.first.label
														: product.qtyStep > 1
															? `Per ${product.qtyStep}`
															: `Per ${product.unitLabel}`}
												</dt>
												<dd className="font-display text-lg italic">
													{afterMinimum
														? afterMinimum.first.price
														: product.qtyStep > 1
															? formatPrice(product.unitPriceCents * product.qtyStep)
															: formatPrice(product.unitPriceCents)}
												</dd>
											</HairlineRow>
										) : null}
										{afterMinimum ? (
											<HairlineRow as="div">
												<dt className="text-sm">{afterMinimum.after.label}</dt>
												<dd className="font-display text-lg italic">{afterMinimum.after.price}</dd>
											</HairlineRow>
										) : null}
										{product.tiers.map((tier) => (
											<HairlineRow
												key={tier.qty}
												as="div">
												<dt className="text-sm">{tier.qty} together</dt>
												<dd className="font-display text-lg italic">
													{formatPrice(tier.priceCents)}
												</dd>
											</HairlineRow>
										))}
									</HairlineList>
								</div>
							) : null}

							{/* The extras ride in on the product, so there is nothing to
							    pass: a product with none shows no picker. */}
							<AddToOrder product={product} />

							<VariantAllergens product={product} />

							{settings.leadTimeDays > 0 ? (
								<p className="text-cocoa-soft text-sm">
									Needs {settings.leadTimeDays} day
									{settings.leadTimeDays === 1 ? "" : "s"} notice.
									{` Pickup from ${localityLine(settings.pickupSuburb)}.`}
								</p>
							) : null}
						</div>
					</div>
				</VariantChoiceProvider>
			</Container>
		</Section>
	);
}
