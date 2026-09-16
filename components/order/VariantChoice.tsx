"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { allergensFor } from "@/lib/allergens";
import { defaultSelection, variantFor, variantOptions, type OptionSelection } from "@/lib/pricing";
import type { Product, ProductVariant } from "@/lib/types";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { AllergenChips, ProductImage } from "@/components/site/ProductCard";

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
}

const VariantChoiceContext = createContext<VariantChoice | null>(null);

/** The hook's body, used by the provider and by the standalone fallback alike. */
function useOwnChoice(product: Product): VariantChoice {
	const [selection, setSelection] = useState<OptionSelection>(() => defaultSelection(product));

	const choose = useCallback((groupId: string, optionId: string) => {
		setSelection((current) => ({ ...current, [groupId]: optionId }));
	}, []);

	return useMemo(
		() => ({ selection, variant: variantFor(product, selection), choose }),
		[product, selection, choose],
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

/** The product photo, swapped for the chosen combination's when it has one. */
export function VariantPhoto({
	product,
	sizes,
	priority,
}: {
	product: Product;
	sizes?: string;
	priority?: boolean;
}) {
	const { variant } = useVariantChoice(product);

	return (
		<ProductImage
			product={product}
			variant={variant}
			sizes={sizes}
			priority={priority}
		/>
	);
}
