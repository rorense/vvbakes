/**
 * What a customer is actually eating, once a variant is chosen.
 *
 * The product's list is the floor: what is in every version of this thing. A
 * variant's list is what that one adds on top, never a replacement. So gluten
 * ticked once on a cake cannot go missing from the carrot one because a box
 * went unticked, and the only thing the owner has to remember per flavour is
 * what makes that flavour different.
 *
 * Under-declaring an allergen is the failure that hurts someone. Everything
 * here is shaped around making that the hard mistake to make.
 */
import { andList } from "./names";
import {
	ALLERGENS,
	ALLERGEN_LABELS,
	type Allergen,
	type Product,
	type ProductOption,
	type ProductVariant,
} from "./types";

/** Something that declares a list of allergens: a variant, or one option. */
type Declares = Pick<ProductVariant, "allergens">;

/**
 * Everything the chosen variant contains, gathered from all three places an
 * allergen can be declared: the product, the combination itself, and each
 * option it is built from.
 *
 * The options matter once a product has more than one group. The walnuts
 * belong to "Carrot", not to "Carrot · 3 layers", so ticking them once on the
 * flavour has to reach all three carrot rows. Callers hand in the options with
 * `variantOptions(product, variant)`; a product with one group has none
 * and the result is what it always was.
 *
 * Always returned in `ALLERGENS` order rather than the order the lists happened
 * to be stored in, so the chips read the same way on every product.
 */
export function allergensFor(
	product: Pick<Product, "allergens">,
	variant: Declares | null,
	options: ReadonlyArray<Pick<ProductOption, "allergens">> = [],
): Allergen[] {
	const all = new Set<Allergen>([
		...product.allergens,
		...(variant?.allergens ?? []),
		...options.flatMap((option) => option.allergens),
	]);
	return ALLERGENS.filter((allergen) => all.has(allergen));
}

/** "tree nuts", "tree nuts and soy", "tree nuts, soy and sesame". */
export function allergenSentence(allergens: readonly Allergen[]): string {
	return andList(allergens.map((allergen) => ALLERGEN_LABELS[allergen].toLowerCase()));
}
