import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { fallbackAccent, productImageAlt, productImageUrl } from "@/lib/images";
import { priceRule } from "@/lib/pricing";
import { ALLERGEN_LABELS, type Accent, type Product } from "@/lib/types";
import { Badge, Chip } from "@/components/ui/Badge";

const ACCENT_TILE: Record<Accent, string> = {
	rose: "bg-rose",
	blush: "bg-blush",
	butter: "bg-butter",
	mint: "bg-mint",
	peach: "bg-peach",
};

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
	className,
	sizes,
	priority,
	/** The colour behind this image, so the no-photo tile never matches it. */
	behind,
}: {
	product: Product;
	className?: string;
	sizes?: string;
	priority?: boolean;
	behind?: Accent | null;
}) {
	const url = productImageUrl(product.imagePath);

	if (url) {
		return (
			<Image
				src={url}
				alt={productImageAlt(product)}
				fill
				sizes={sizes ?? "(min-width: 640px) 33vw, 50vw"}
				className={cn("object-cover", className)}
				priority={priority}
			/>
		);
	}

	return (
		<div
			className={cn(
				"flex h-full w-full items-center justify-center overflow-hidden",
				ACCENT_TILE[fallbackAccent(product, behind)],
				className,
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

export function AvailabilityBadge({ product }: { product: Product }) {
	if (product.isAvailable) return null;
	return <Badge tone="cocoa">{product.availabilityNote ?? "Sold out"}</Badge>;
}

export function AllergenChips({ product }: { product: Product }) {
	if (product.allergens.length === 0) return null;
	return (
		<ul className="flex flex-wrap gap-1.5">
			{product.allergens.map((allergen) => (
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
	className,
	behind,
}: {
	product: Product;
	priority?: boolean;
	className?: string;
	/** The band colour this card sits on. */
	behind?: Accent | null;
}) {
	return (
		<article className={cn("group flex flex-col gap-3", className)}>
			<Link
				href={`/shop/${product.slug}`}
				className="rounded-lg focus-visible:outline-offset-4">
				<div
					className={cn(
						"arch-soft bg-paper-deep relative aspect-4/5",
						!product.isAvailable && "opacity-60 saturate-50",
					)}>
					<ProductImage
						product={product}
						priority={priority}
						behind={behind}
					/>
					{!product.isAvailable ? (
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
				<p className="font-display text-cocoa-soft text-base italic">{priceRule(product)}</p>
				{product.description ? (
					<p className="text-cocoa-soft mt-1 line-clamp-2 text-sm">{product.description}</p>
				) : null}
			</div>
		</article>
	);
}
