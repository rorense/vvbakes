"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { allergensFor } from "@/lib/allergens";
import { defaultVariant } from "@/lib/pricing";
import type { Product, ProductVariant } from "@/lib/types";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { AllergenChips, ProductImage } from "@/components/site/ProductCard";

/**
 * Which variant a product page is currently showing.
 *
 * Lifted out of `AddToOrder` because the photo and the picker sit in opposite
 * columns of a page that is otherwise rendered on the server. Sharing the
 * choice between them means either turning the whole page into one client
 * component, or a context that two small islands both read. This is the second,
 * so everything between them — the heading, the description, the price table —
 * stays on the server where it belongs.
 */
interface VariantChoice {
	variant: ProductVariant | null;
	setVariant: (variant: ProductVariant | null) => void;
}

const VariantChoiceContext = createContext<VariantChoice | null>(null);

export function VariantChoiceProvider({
	product,
	children,
}: {
	product: Product;
	children: React.ReactNode;
}) {
	const [variant, setVariant] = useState<ProductVariant | null>(() => defaultVariant(product));
	const value = useMemo(() => ({ variant, setVariant }), [variant]);

	return <VariantChoiceContext value={value}>{children}</VariantChoiceContext>;
}

/**
 * The shared choice, or one of its own when there is no provider above.
 *
 * The fallback is what keeps `AddToOrder` usable on its own: a picker that
 * works but changes no photo is a sensible thing for it to be, and is better
 * than a crash on whichever page forgets the provider.
 */
export function useVariantChoice(product: Product): VariantChoice {
	const shared = useContext(VariantChoiceContext);
	const [local, setLocal] = useState<ProductVariant | null>(() => defaultVariant(product));
	const own = useMemo(() => ({ variant: local, setVariant: setLocal }), [local]);

	return shared ?? own;
}

/**
 * What the chosen variant contains: the product's allergens plus its own.
 *
 * The whole block moves with the selection, heading included. A cake with no
 * allergens of its own but one walnut flavour has nothing to say until that
 * flavour is picked, and a "Contains" heading over an empty list reads as a
 * reassurance nobody wrote.
 */
export function VariantAllergens({ product }: { product: Product }) {
	const { variant } = useVariantChoice(product);
	const allergens = allergensFor(product, variant);

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

/** The product photo, swapped for the chosen variant's when it has one. */
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
