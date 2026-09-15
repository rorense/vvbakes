import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE_NAME, siteUrl } from "@/lib/constants";
import { formatPrice, priceRule } from "@/lib/pricing";
import {
	getCategories,
	getExtras,
	getProductBySlug,
	getProductSlugs,
	getSettings,
} from "@/lib/queries";
import { Container, Section } from "@/components/ui/Container";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { ArchFrame } from "@/components/ui/ArchFrame";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { BreadcrumbJsonLd, type Crumb } from "@/components/site/BreadcrumbJsonLd";
import { AddToOrder } from "@/components/order/AddToOrder";
import {
	VariantAllergens,
	VariantChoiceProvider,
	VariantPhoto,
} from "@/components/order/VariantChoice";

// Same window as the home page, and for the reason written there.
export const revalidate = 3600;

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
	if (!product) return { title: "Not found" };

	return {
		title: product.name,
		description:
			product.description ?? `${product.name} from vvbakes. ${priceRule(product)}. Baked to order.`,
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
			description: product.description ?? priceRule(product),
			url: `${siteUrl()}/shop/${product.slug}`,
		},
	};
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const [product, categories, settings, extras] = await Promise.all([
		getProductBySlug(slug),
		getCategories(),
		getSettings(),
		// One list for the whole shop, so every product page asks the same question
		// and gets the same answer. Empty until the owner adds one, which is what
		// hides the picker rather than showing an empty heading.
		getExtras(),
	]);

	if (!product) notFound();

	const category = categories.find((c) => c.id === product.categoryId) ?? null;

	// One array drives both the visible trail and the structured data below it.
	// Google wants the markup to describe the path a visitor can see, so the two
	// are built from the same source rather than written out twice.
	const crumbs: Crumb[] = [
		{ name: "Shop", href: "/shop" },
		...(category ? [{ name: category.name, href: `/shop#${category.slug}` }] : []),
		{ name: product.name, href: `/shop/${product.slug}` },
	];

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

				{/* The photo and the picker sit in opposite columns and have to agree
				    on which variant is showing, so the choice lives in a provider
				    around both rather than inside either. Everything between them is
				    still rendered on the server. */}
				<VariantChoiceProvider product={product}>
					<div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
						<ArchFrame
							tone="blush"
							className="relative aspect-4/5 w-full">
							<VariantPhoto
								product={product}
								sizes="(min-width: 1024px) 45vw, 100vw"
								priority
							/>
						</ArchFrame>

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
							    `unitPriceCents`, so the whole table gives way to the one
							    line that is actually true. */}
							{product.priceOnRequest ? (
								<div className="flex flex-col gap-2">
									<SectionLabel as="h2">Price</SectionLabel>
									<p className="text-cocoa-soft text-sm">
										It depends on the size and how much work goes on top, so I price it once I know
										what you&rsquo;re after. Tell me below and I&rsquo;ll come back to you with a
										number and where to send it.
									</p>
								</div>
							) : product.variants.length === 0 || product.tiers.length > 0 ? (
								<div className="flex flex-col gap-2">
									<SectionLabel as="h2">Price</SectionLabel>
									<HairlineList as="dl">
										{product.variants.length === 0 ? (
											<HairlineRow as="div">
												<dt className="text-sm">
													{product.qtyStep > 1
														? `Per ${product.qtyStep}`
														: `Per ${product.unitLabel}`}
												</dt>
												<dd className="font-display text-lg italic">
													{product.qtyStep > 1
														? formatPrice(product.unitPriceCents * product.qtyStep)
														: formatPrice(product.unitPriceCents)}
												</dd>
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

							<AddToOrder
								product={product}
								extras={extras}
							/>

							<VariantAllergens product={product} />

							{settings.leadTimeDays > 0 ? (
								<p className="text-cocoa-soft text-sm">
									Needs {settings.leadTimeDays} day
									{settings.leadTimeDays === 1 ? "" : "s"} notice.
									{settings.pickupSuburb ? ` Pickup from ${settings.pickupSuburb}.` : ""}
								</p>
							) : null}
						</div>
					</div>
				</VariantChoiceProvider>
			</Container>
		</Section>
	);
}
