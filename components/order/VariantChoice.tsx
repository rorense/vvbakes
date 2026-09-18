"use client";

import Image from "next/image";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { allergensFor } from "@/lib/allergens";
import { cn } from "@/lib/cn";
import { productImageUrl, variantImagePath } from "@/lib/images";
import { defaultSelection, variantFor, variantOptions, type OptionSelection } from "@/lib/pricing";
import type { Product, ProductVariant } from "@/lib/types";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { AllergenChips, ProductImage } from "@/components/site/ProductCard";

/** One tile in the strip: where the photo lives, and which number it is. */
interface PickedPhoto {
	path: string;
	position: number;
}

/**
 * What a product page is currently showing.
 *
 * Held as the option picked in each group rather than as a variant, because that is
 * what the pickers actually edit: changing the layer count leaves the flavour
 * alone, and the combination those two now name is looked up afterwards. A
 * selection that names no row — a hole in the matrix — resolves to a null
 * variant, which is a state the page has to be able to render rather than a
 * bug.
 *
 * Lifted out of `AddToOrder` because the photo and the pickers sit in opposite
 * columns of a page that is otherwise rendered on the server. Sharing the
 * choice between them means either turning the whole page into one client
 * component, or a context that two small islands both read. This is the second,
 * so everything between them — the heading, the description, the price table —
 * stays on the server where it belongs.
 */
interface VariantChoice {
	selection: OptionSelection;
	/** The combination the selection names, or null when there is no such row. */
	variant: ProductVariant | null;
	choose: (groupId: string, optionId: string) => void;
	/**
	 * The tile the customer clicked in the strip under the photo, or null for
	 * whichever photo the chosen combination implies. Null is where every page
	 * starts and where choosing a flavour puts it back.
	 */
	picked: PickedPhoto | null;
	pick: (photo: PickedPhoto | null) => void;
}

const VariantChoiceContext = createContext<VariantChoice | null>(null);

/** The hook's body, used by the provider and by the standalone fallback alike. */
function useOwnChoice(product: Product): VariantChoice {
	const [selection, setSelection] = useState<OptionSelection>(() => defaultSelection(product));
	const [picked, pick] = useState<PickedPhoto | null>(null);

	const choose = useCallback((groupId: string, optionId: string) => {
		setSelection((current) => ({ ...current, [groupId]: optionId }));
		// A flavour can carry a photo of its own, and the tile they clicked was a
		// tile of the flavour they clicked it under. Holding on to it would leave
		// the page showing the chocolate one with the word "Lemon" beside it.
		pick(null);
	}, []);

	return useMemo(
		() => ({ selection, variant: variantFor(product, selection), choose, picked, pick }),
		[product, selection, choose, picked],
	);
}

export function VariantChoiceProvider({
	product,
	children,
}: {
	product: Product;
	children: React.ReactNode;
}) {
	const value = useOwnChoice(product);

	return <VariantChoiceContext value={value}>{children}</VariantChoiceContext>;
}

/**
 * The shared choice, or one of its own when there is no provider above.
 *
 * The fallback is what keeps `AddToOrder` usable on its own: pickers that work
 * but change no photo are a sensible thing for it to be, and better than a
 * crash on whichever page forgets the provider.
 */
export function useVariantChoice(product: Product): VariantChoice {
	const shared = useContext(VariantChoiceContext);
	const own = useOwnChoice(product);

	return shared ?? own;
}

/**
 * What the chosen combination contains: the product's allergens, the options'
 * and its own.
 *
 * The whole block moves with the selection, heading included. A cake with no
 * allergens of its own but one walnut flavour has nothing to say until that
 * flavour is picked, and a "Contains" heading over an empty list reads as a
 * reassurance nobody wrote.
 */
export function VariantAllergens({ product }: { product: Product }) {
	const { variant } = useVariantChoice(product);
	const allergens = allergensFor(product, variant, variant ? variantOptions(product, variant) : []);

	if (allergens.length === 0) return null;

	return (
		<div className="flex flex-col gap-2">
			<SectionLabel as="h2">Contains</SectionLabel>
			<AllergenChips allergens={allergens} />
			<p className="text-cocoa-soft text-xs">
				Baked in a home kitchen that also handles nuts, dairy, egg, gluten and sesame. Tell me about
				any allergies when you order.
			</p>
		</div>
	);
}

/**
 * The big photo: the chosen combination's, or whichever tile of the strip
 * underneath was clicked last.
 */
export function VariantPhoto({
	product,
	sizes,
	priority,
}: {
	product: Product;
	sizes?: string;
	priority?: boolean;
}) {
	const { variant, picked } = useVariantChoice(product);

	return (
		<ProductImage
			product={product}
			variant={variant}
			picked={picked}
			sizes={sizes}
			priority={priority}
		/>
	);
}

/**
 * Every photo this product has, in the order the strip shows them.
 *
 * The one the big frame would show on its own leads, so the tile that takes a
 * customer back to it is a tile like any other rather than a second control
 * saying "never mind". A product with no photo at all contributes no leader and
 * the strip is its extras alone, which is a real state: the catalogue goes up
 * before the shoot, and a product can pick up a second angle before it has a
 * first.
 *
 * Paths that cannot be turned into a URL are dropped here rather than rendered
 * as gaps, so the count the tiles read out loud is the count of tiles there are.
 */
function galleryPhotos(product: Product, variant: ProductVariant | null) {
	const options = variant ? variantOptions(product, variant) : [];
	const lead = variantImagePath(product, variant, options);

	return [...(lead ? [lead] : []), ...product.galleryImagePaths]
		.map((path) => ({ path, url: productImageUrl(path), isLead: path === lead }))
		.filter((photo): photo is { path: string; url: string; isLead: boolean } => photo.url !== null);
}

/**
 * The strip of thumbnails under the main photo.
 *
 * Nothing is drawn until there are two of them, which is the whole point of the
 * feature: one photo is the photo above, and a strip holding a smaller copy of
 * it is furniture.
 *
 * Clicking the leading tile clears the choice rather than pinning that path, so
 * a customer who looks at the slice and then goes back to the whole cake is in
 * the state they started in, and picking a flavour after that still moves the
 * photo.
 */
export function VariantGallery({ product }: { product: Product }) {
	const { variant, picked, pick } = useVariantChoice(product);
	const photos = galleryPhotos(product, variant);

	if (photos.length < 2) return null;

	const shown = picked?.path ?? photos.find((photo) => photo.isLead)?.path;

	return (
		<ul className="flex flex-wrap gap-2">
			{photos.map((photo, index) => {
				const position = index + 1;
				const current = photo.path === shown;

				return (
					<li key={photo.path}>
						<button
							type="button"
							aria-pressed={current}
							onClick={() => pick(photo.isLead ? null : { path: photo.path, position })}
							className={cn(
								// Two pixels on every tile, not one on some and two on the
								// chosen one: a border that grows on click nudges the whole
								// strip sideways, and the colour is doing the telling anyway.
								"bg-paper-deep relative block size-16 overflow-hidden rounded-md border-2 transition-colors sm:size-20",
								current ? "border-cocoa" : "border-line hover:border-cocoa-soft",
							)}>
							<Image
								src={photo.url}
								alt=""
								fill
								sizes="80px"
								className="object-cover"
							/>
							<span className="sr-only">
								Show photo {position} of {photos.length}
							</span>
						</button>
					</li>
				);
			})}
		</ul>
	);
}
