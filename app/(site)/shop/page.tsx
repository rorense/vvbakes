import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { getCatalogue, getSettings } from "@/lib/queries";
import { ACCENT_BG } from "@/lib/types";
import { ButtonLink } from "@/components/ui/Button";
import { Container, Section } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { ProductCard } from "@/components/site/ProductCard";

// Same window as the home page, and for the reason written there.
export const revalidate = 3600;

export const metadata: Metadata = {
	title: "Shop",
	description:
		"Cupcakes, cookies and Indonesian cakes baked for the day you collect them, plus custom cakes made to your brief.",
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
						    magazine lets a display line bleed. */}
						<h2
							id={`${category.slug}-heading`}
							className="mb-8 -ml-1 text-4xl sm:-ml-2"
							style={{ fontVariationSettings: '"SOFT" 40, "WONK" 1' }}>
							{category.name}
						</h2>

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

			<Section
				tone="paper"
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
		</>
	);
}
