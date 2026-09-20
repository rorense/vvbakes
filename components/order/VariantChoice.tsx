"use client";

import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { allergensFor } from "@/lib/allergens";
import { cn } from "@/lib/cn";
import { galleryImageAlt, productImageUrl, variantImageAlt, variantImagePath } from "@/lib/images";
import {
	defaultSelection,
	optionGroups,
	variantFor,
	variantOptions,
	type OptionSelection,
} from "@/lib/pricing";
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

/** One photo the frame can show: where it lives, and the URL that reaches it. */
interface GalleryPhoto {
	path: string;
	url: string;
	isLead: boolean;
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
 * A path listed twice counts once, for the same reason and for one more: the
 * frame below stacks these, and two elements on one photo is two downloads.
 */
function galleryPhotos(product: Product, variant: ProductVariant | null): GalleryPhoto[] {
	const options = variant ? variantOptions(product, variant) : [];
	const lead = variantImagePath(product, variant, options);

	return [...new Set([...(lead ? [lead] : []), ...product.galleryImagePaths])]
		.map((path) => ({ path, url: productImageUrl(path), isLead: path === lead }))
		.filter((photo): photo is GalleryPhoto => photo.url !== null);
}

/**
 * How many photos the frame will hold at once.
 *
 * The frame stacks what it can show rather than repointing one element, so this
 * is also what a product page ends up downloading and it needs a ceiling. Nine
 * is the strip at its fullest: a main photo and the eight `MAX_GALLERY_PHOTOS`
 * allows. The three after it cover the flavours of a product that gives each
 * one a picture of its own.
 *
 * A product with more photos than that still works. The ones past the ceiling
 * are fetched when they are picked, which is what every photo used to do.
 */
const MAX_FRAME_PHOTOS = 12;

/**
 * Every photo the frame can end up showing, the strip's first.
 *
 * The strip leads because those are the tiles under the customer's hand. After
 * them come the pictures behind the answers they have not clicked yet, so that
 * changing flavour moves the photo as quickly as changing tile does.
 */
function framePhotos(product: Product, variant: ProductVariant | null): GalleryPhoto[] {
	const strip = galleryPhotos(product, variant);
	const seen = new Set(strip.map((photo) => photo.path));
	const rest: GalleryPhoto[] = [];

	for (const source of [
		...optionGroups(product).flatMap((group) => group.options),
		...product.variants,
	]) {
		const path = source.imagePath;
		if (!path || seen.has(path)) continue;
		seen.add(path);

		const url = productImageUrl(path);
		if (url) rest.push({ path, url, isLead: false });
	}

	return [...strip, ...rest].slice(0, MAX_FRAME_PHOTOS);
}

/**
 * False on the first paint, true once the browser has a moment to spare.
 *
 * What it gates is the warming in `VariantPhoto`, so the opening seconds of a
 * page load go on the photo somebody is looking at rather than on seven they
 * have not asked for. The timeout is a ceiling on the wait: a page that never
 * falls quiet warms anyway, and it is short because the photo a customer clicks
 * first is the one they click soonest.
 */
function useIdle(): boolean {
	const [idle, setIdle] = useState(false);

	useEffect(() => {
		if (typeof window.requestIdleCallback !== "function") {
			const timer = window.setTimeout(() => setIdle(true), 500);
			return () => window.clearTimeout(timer);
		}

		const handle = window.requestIdleCallback(() => setIdle(true), { timeout: 800 });
		return () => window.cancelIdleCallback(handle);
	}, []);

	return idle;
}

/**
 * The big photo: the chosen combination's, or whichever tile of the strip
 * underneath was clicked last.
 *
 * Every photo it can show gets an element of its own, stacked, all but one held
 * at zero opacity. Repointing a single element at a new source made a click
 * cost a round trip to the image optimiser and a decode before anything moved,
 * which is what made the strip feel slow; a stack turns the same click into a
 * class change over bytes the browser already holds.
 *
 * Only the photo on screen is there to begin with, so the page still loads one
 * image and the biggest thing on it is still the first thing fetched. The rest
 * arrive once the browser is idle, as ordinary lazy images, so a frame that was
 * scrolled past never downloads them at all.
 *
 * A photo that has not arrived yet is mounted but not shown: the one already on
 * screen stays until the new one has loaded, which is what a browser does for
 * itself when a single element changes source, and it is the difference between
 * a click that is slow and a click that empties the frame.
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
	const options = variant ? variantOptions(product, variant) : [];
	const photos = framePhotos(product, variant);
	const chosen = picked?.path ?? variantImagePath(product, variant, options);
	const warm = useIdle();

	const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set());
	const [showing, setShowing] = useState(chosen);

	const filled = photos.some((photo) => photo.path === showing);

	// The chosen photo takes the frame when it can fill it, and not before — the
	// wait is what keeps the photo already on screen there while the next one
	// loads. A frame with nothing in it has nothing to keep, so it switches at
	// once.
	if (chosen !== showing && (!filled || chosen === null || loaded.has(chosen))) setShowing(chosen);

	return (
		<>
			{/*
			 * The badge tile, for a product with no photo of its own. It goes under
			 * the stack rather than instead of it, because a product can have an
			 * empty main photo and a full strip — the catalogue goes up before the
			 * shoot — and stopping here would leave those photos unwarmed and the
			 * first tile clicked as slow as it ever was.
			 */}
			{filled ? null : (
				<ProductImage
					product={product}
					sizes={sizes}
					priority={priority}
				/>
			)}
			{photos.map((photo) => {
				const current = photo.path === showing;
				if (!current && !warm && photo.path !== chosen) return null;

				return (
					<Image
						key={photo.path}
						src={photo.url}
						/*
						 * Only the photo on screen is described. The stack behind it is
						 * the same cake again, and a screen reader reading all nine of
						 * them out is worse than it reading none.
						 */
						alt={
							current
								? picked
									? galleryImageAlt(product, picked.position)
									: variantImageAlt(product, variant, options)
								: ""
						}
						aria-hidden={current ? undefined : true}
						fill
						sizes={sizes ?? "(min-width: 640px) 33vw, 50vw"}
						priority={current && priority}
						onLoad={() =>
							setLoaded((paths) => (paths.has(photo.path) ? paths : new Set(paths).add(photo.path)))
						}
						className={cn("object-cover", current ? "opacity-100" : "opacity-0")}
					/>
				);
			})}
		</>
	);
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
