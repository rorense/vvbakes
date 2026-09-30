import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { fallbackAccent, productImageUrl, variantImageAlt, variantImagePath } from "@/lib/images";
import { isOrderable, priceRule, variantOptions } from "@/lib/pricing";
import {
	ACCENT_BG,
	ALLERGEN_LABELS,
	type Accent,
	type Allergen,
	type Product,
	type ProductVariant,
} from "@/lib/types";
import { Badge, Chip } from "@/components/ui/Badge";

/**
 * A product photo, or, until there is one, the vvbakes badge on a pastel tile.
 *
 * The catalogue goes live before the photo shoot, so this state has to look
 * finished rather than broken. A grey "image coming soon" box says the site is
 * unfinished; the brand mark on colour says the photo simply is not the point
 * yet. The pastel is derived from the product slug, so a row of un-photographed
 * products reads as a deliberate set rather than five identical gaps.
 */
export function ProductImage({
	product,
	/**
	 * The variant being shown, when one is chosen. Its own photo wins, then one
	 * belonging to an answer it is made of, then the product's — which is what a
	 * product whose variants differ only by size wants. See `variantImagePath`.
	 */
	variant = null,
	sizes,
	priority,
	/** The colour behind this image, so the no-photo tile never matches it. */
	behind,
}: {
	product: Product;
	variant?: ProductVariant | null;
	sizes?: string;
	priority?: boolean;
	behind?: Accent | null;
}) {
	const options = variant ? variantOptions(product, variant) : [];
	const url = productImageUrl(variantImagePath(product, variant, options));

	if (url) {
		return (
			<Image
				src={url}
				alt={variantImageAlt(product, variant, options)}
				fill
				sizes={sizes ?? "(min-width: 640px) 33vw, 50vw"}
				className="object-cover"
				priority={priority}
			/>
		);
	}

	return (
		<div
			className={cn(
				"flex h-full w-full items-center justify-center overflow-hidden",
				ACCENT_BG[fallbackAccent(product, behind)],
			)}
			aria-hidden="true">
			<Image
				src="/logo.png"
				alt=""
				width={800}
				height={800}
				className="w-1/2 max-w-48 opacity-60 mix-blend-multiply"
			/>
		</div>
	);
}

/** Only rendered for a product that is off; the caller does that check. */
function AvailabilityBadge({ product }: { product: Product }) {
	// "Sold out" also covers a product whose every flavour is switched off.
	return <Badge>{product.availabilityNote ?? "Sold out"}</Badge>;
}

/**
 * Takes a list rather than a product, because what a customer is eating
 * depends on which variant they picked. See lib/allergens.ts.
 */
export function AllergenChips({ allergens }: { allergens: readonly Allergen[] }) {
	if (allergens.length === 0) return null;
	return (
		<ul className="flex flex-wrap gap-1.5">
			{allergens.map((allergen) => (
				<li key={allergen}>
					<Chip>{ALLERGEN_LABELS[allergen]}</Chip>
				</li>
			))}
		</ul>
	);
}

export function ProductCard({
	product,
	priority,
	behind,
}: {
	product: Product;
	priority?: boolean;
	/** The band colour this card sits on. */
	behind?: Accent | null;
}) {
	const orderable = isOrderable(product);

	return (
		<article className="group flex flex-col gap-3">
			<Link
				href={`/shop/${product.slug}`}
				className="rounded-lg focus-visible:outline-offset-4">
				<div
					className={cn(
						"arch-soft bg-paper-deep relative aspect-4/5",
						!orderable && "opacity-60 saturate-50",
					)}>
					<ProductImage
						product={product}
						priority={priority}
						behind={behind}
					/>
					{!orderable ? (
						<div className="absolute top-3 left-3">
							<AvailabilityBadge product={product} />
						</div>
					) : null}
				</div>
			</Link>

			<div className="flex flex-col gap-1">
				<h3 className="text-xl">
					<Link
						href={`/shop/${product.slug}`}
						className="decoration-1 underline-offset-4 group-hover:underline">
						{product.name}
					</Link>
				</h3>
				{/* Name and one price only. A card in a four-up grid is an invitation to
				    open the product, not the place to sell the bundle or tell the story;
				    both are on the product page, where there is room to read them.

				    No price at all on one that cannot be ordered. The badge already says
				    why, and with every flavour off the range would be quoted from
				    combinations nobody can buy. */}
				{orderable ? (
					<p className="font-display text-cocoa-soft text-base italic">
						{priceRule(product, { bundles: false })}
					</p>
				) : null}
			</div>
		</article>
	);
}
