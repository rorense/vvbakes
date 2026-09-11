import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { getCatalogue, getSettings } from "@/lib/queries";
import type { Accent } from "@/lib/types";
import { ButtonLink } from "@/components/ui/Button";
import { Container, Section } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { ProductCard } from "@/components/site/ProductCard";

export const revalidate = 300;

export const metadata: Metadata = {
	title: "Shop",
	description:
		"The ready-made half of vvbakes: cupcakes, cookies and Indonesian cakes, baked for the day you collect them. Custom cakes are made to order separately.",
};

const BAND: Record<Accent, string> = {
	rose: "bg-rose",
	blush: "bg-blush",
	butter: "bg-butter",
	mint: "bg-mint",
	peach: "bg-peach",
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
							Between bakes at the moment. Custom cakes are still on though &mdash; ask away.
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
					<div className="flex flex-col gap-4">
						<SectionLabel>Shop</SectionLabel>
						<h1 className="font-display max-w-2xl text-4xl">The ready-made half</h1>
						<p className="text-cocoa-soft max-w-xl">
							Everything here is baked for the day you pick, no decisions required. After a custom
							cake instead? Say so on the order form.
							{settings.leadTimeDays > 0
								? ` We need ${settings.leadTimeDays} day${settings.leadTimeDays === 1 ? "" : "s"} notice.`
								: ""}
						</p>
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
					className={cn("relative overflow-hidden py-14 sm:py-20", BAND[category.accent])}>
					<div
						className="dot-field pointer-events-none absolute inset-0"
						aria-hidden="true"
					/>
					<Container
						width="wide"
						className="relative">
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
