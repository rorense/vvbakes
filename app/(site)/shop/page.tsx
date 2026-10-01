import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/lib/constants";
import { cn } from "@/lib/cn";
import { getCatalogue, getSettings } from "@/lib/queries";
import { SITE_CITY, catalogueItemListJsonLd } from "@/lib/seo";
import { ACCENT_BG } from "@/lib/types";
import { JsonLd } from "@/components/site/JsonLd";
import { Container, Section } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { ProductCard } from "@/components/site/ProductCard";
import { OrderPrompt } from "@/components/site/OrderPrompt";

// Same window as the home page, and for the reason written there.
export const revalidate = 3600;

/**
 * "Shop" alone is a navigation label, not a title tag: it says nothing about
 * what is in the shop or which city it is in, and the template only adds the
 * brand after it. The absolute title spells both out, which is what somebody
 * searching for a cake shop near them actually typed.
 */
export const metadata: Metadata = {
	title: {
		absolute: `Cake & Bakery Menu in ${SITE_CITY} | ${SITE_NAME}`,
	},
	description: `Cupcakes, cookies and Indonesian cakes baked in ${SITE_CITY} for the day you collect them, plus custom cakes made to your brief.`,
	alternates: { canonical: "/shop" },
};

export default async function ShopPage() {
	const [catalogue, settings] = await Promise.all([getCatalogue(), getSettings()]);

	if (catalogue.length === 0) {
		return (
			<Section tone="paper">
				<Container width="narrow">
					<div className="flex flex-col items-start gap-4">
						<SectionLabel>Shop</SectionLabel>
						<h1 className="font-display text-3xl">Nothing on the shelf just yet</h1>
						<p className="text-cocoa-soft">
							Between bakes at the moment. Custom cakes are still on though, so ask away.
						</p>
					</div>
				</Container>
			</Section>
		);
	}

	return (
		<>
			<Section
				tone="paper"
				size="tight">
				<Container width="wide">
					{/* The intro runs the full width of the container rather than a reading
					    column: the client wants it across the page, not broken to half of it. */}
					<div className="flex flex-col gap-4">
						<SectionLabel>Shop</SectionLabel>
						<h1 className="font-display text-4xl">Choose your favourites</h1>
						<p className="text-cocoa-soft">
							A selection of our favourite bakes, freshly made for your chosen date. Choose your
							treats, pick your flavours, and I&rsquo;ll take care of the rest.
						</p>
						{/* This used to send people to a panel at the bottom of the order
						    form. The custom cake is a product now, so it sends them to it. */}
						<p className="text-cocoa-soft">
							Looking for something a little more personal? Our{" "}
							<Link
								href="/shop/custom-cake"
								className="underline underline-offset-4">
								custom cakes
							</Link>{" "}
							can be made to suit your celebration. Tell me what you have in mind on the custom cake
							page - photos and inspiration are always welcome, and I&rsquo;ll get back to you with
							a price.
						</p>
						{/* Still the admin's lead time rather than a hardcoded 7, so the promise
						    on the page moves when the setting does. */}
						{settings.leadTimeDays > 0 ? (
							<p className="text-cocoa-soft">
								{`Please allow at least ${settings.leadTimeDays} day${settings.leadTimeDays === 1 ? "" : "s"} notice for regular orders. For custom cakes, 2-3 weeks notice is ideal so I have plenty of time to bring your ideas to life.`}
							</p>
						) : null}
					</div>

					{/* Category rail. Anchors rather than filters: with this many
					    products, hiding things costs more than it saves. */}
					<nav
						aria-label="Categories"
						className="rail -mx-5 mt-8 flex gap-2 px-5 sm:mx-0 sm:px-0">
						{catalogue.map((category) => (
							<Link
								key={category.id}
								href={`#${category.slug}`}
								className="border-line hover:border-cocoa hover:bg-paper-deep rounded-pill shrink-0 border px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors">
								{category.name}
							</Link>
						))}
					</nav>
				</Container>
			</Section>

			{catalogue.map((category, index) => (
				<section
					key={category.id}
					id={category.slug}
					aria-labelledby={`${category.slug}-heading`}
					className={cn("py-14 sm:py-20", ACCENT_BG[category.accent])}>
					<Container width="wide">
						{/* The heading runs slightly past the container edge, the way a
						    magazine lets a display line bleed.

						    The link beside it is the only route from this page to the
						    category's own page, and it is here rather than on the rail at
						    the top because the rail's job is to jump down this page and a
						    link that navigates away instead would be the same chip doing
						    two different things. It also matters that a crawler finds
						    these at all: an anchor to `#cupcakes` is this page, so without
						    this line the category pages would be in the sitemap and linked
						    from nowhere. */}
						<div className="mb-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
							<h2
								id={`${category.slug}-heading`}
								className="-ml-1 text-4xl sm:-ml-2"
								style={{ fontVariationSettings: '"SOFT" 40, "WONK" 1' }}>
								{category.name}
							</h2>
							<Link
								href={`/shop/category/${category.slug}`}
								className="text-sm font-medium underline underline-offset-4">
								All {category.name.toLowerCase()}
							</Link>
						</div>

						<div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
							{category.products.map((product) => (
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
			))}

			<OrderPrompt tone="paper" />

			{/* The menu in the order a visitor scrolls it, flattened across the
			    category bands: positions run 1..n over the whole page rather than
			    restarting per band, because the list describes the page and the
			    page is one list. Each entry is a link, not an inlined product. The
			    product's own page already carries the full Product markup, and
			    repeating it here would ship the catalogue twice. */}
			<JsonLd
				data={catalogueItemListJsonLd(
					catalogue.flatMap((category) =>
						category.products.map((product) => ({ slug: product.slug, name: product.name })),
					),
				)}
			/>
		</>
	);
}
