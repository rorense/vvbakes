import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { siteUrl } from "@/lib/constants";
import { productImageUrl } from "@/lib/images";
import { formatPrice, priceRule } from "@/lib/pricing";
import { getCategories, getProductBySlug, getProductSlugs, getSettings } from "@/lib/queries";
import { Container, Section } from "@/components/ui/Container";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { ArchFrame } from "@/components/ui/ArchFrame";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { AllergenChips, ProductImage } from "@/components/site/ProductCard";
import { AddToOrder } from "@/components/order/AddToOrder";

export const revalidate = 300;

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

	const image = productImageUrl(product.imagePath);

	return {
		title: product.name,
		description:
			product.description ??
			`${product.name} from vvbakes — ${priceRule(product)}. Baked to order.`,
		alternates: { canonical: `/shop/${product.slug}` },
		openGraph: {
			title: `${product.name} — vvbakes`,
			description: product.description ?? priceRule(product),
			url: `${siteUrl()}/shop/${product.slug}`,
			images: image ? [{ url: image }] : undefined,
		},
	};
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const [product, categories, settings] = await Promise.all([
		getProductBySlug(slug),
		getCategories(),
		getSettings(),
	]);

	if (!product) notFound();

	const category = categories.find((c) => c.id === product.categoryId) ?? null;

	return (
		<Section
			tone="paper"
			size="tight">
			<Container width="wide">
				<nav
					aria-label="Breadcrumb"
					className="text-cocoa-soft mb-8 text-xs">
					<ol className="flex flex-wrap items-center gap-2">
						<li>
							<Link
								href="/shop"
								className="underline-offset-4 hover:underline">
								Shop
							</Link>
						</li>
						{category ? (
							<>
								<li aria-hidden="true">/</li>
								<li>
									<Link
										href={`/shop#${category.slug}`}
										className="underline-offset-4 hover:underline">
										{category.name}
									</Link>
								</li>
							</>
						) : null}
						<li aria-hidden="true">/</li>
						<li aria-current="page">{product.name}</li>
					</ol>
				</nav>

				<div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
					<ArchFrame
						tone="blush"
						className="relative aspect-4/5 w-full">
						<ProductImage
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

						<div className="flex flex-col gap-2">
							<SectionLabel as="h2">Price</SectionLabel>
							<HairlineList as="dl">
								<HairlineRow as="div">
									<dt className="text-sm">
										{product.qtyStep > 1 ? `Per ${product.qtyStep}` : `Per ${product.unitLabel}`}
									</dt>
									<dd className="font-display text-lg italic">
										{product.qtyStep > 1
											? formatPrice(product.unitPriceCents * product.qtyStep)
											: formatPrice(product.unitPriceCents)}
									</dd>
								</HairlineRow>
								{product.tiers.map((tier) => (
									<HairlineRow
										key={tier.qty}
										as="div">
										<dt className="text-sm">{tier.qty} together</dt>
										<dd className="font-display text-lg italic">{formatPrice(tier.priceCents)}</dd>
									</HairlineRow>
								))}
							</HairlineList>
						</div>

						<AddToOrder product={product} />

						{product.allergens.length > 0 ? (
							<div className="flex flex-col gap-2">
								<SectionLabel as="h2">Contains</SectionLabel>
								<AllergenChips product={product} />
								<p className="text-cocoa-soft text-xs">
									Baked in a home kitchen that also handles nuts, dairy, egg, gluten and sesame.
									Tell me about any allergies when you order.
								</p>
							</div>
						) : null}

						{settings.leadTimeDays > 0 ? (
							<p className="text-cocoa-soft text-sm">
								Needs {settings.leadTimeDays} day
								{settings.leadTimeDays === 1 ? "" : "s"} notice.
								{settings.pickupSuburb ? ` Pickup from ${settings.pickupSuburb}.` : ""}
							</p>
						) : null}
					</div>
				</div>
			</Container>
		</Section>
	);
}
