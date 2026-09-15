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
import {
	ALLERGENS,
	ALLERGEN_LABELS,
	type Allergen,
	type Product,
	type ProductOption,
	type ProductVariant,
} from "./types";

/** Something that declares a list of allergens: a variant, or one answer. */
type Declares = Pick<ProductVariant, "allergens">;

/**
 * Every allergen a combination is made of, gathered from all three places one
 * can be declared: the product, the combination itself, and each answer it is
 * built from.
 *
 * The answers matter once a product asks more than one question. The walnuts
 * belong to "Carrot", not to "Carrot · 3 layers", so ticking them once on the
 * flavour has to reach all three carrot rows. Callers hand in the answers with
 * `variantOptions(product, variant)`; a product that asks one question has none
 * and the result is what it always was.
 */
function gather(
	product: Pick<Product, "allergens">,
	variant: Declares | null,
	options: ReadonlyArray<Pick<ProductOption, "allergens">>,
): Set<Allergen> {
	return new Set<Allergen>([
		...product.allergens,
		...(variant?.allergens ?? []),
		...options.flatMap((option) => option.allergens),
	]);
}

/**
 * Everything the chosen variant contains: the product's allergens and its own.
 *
 * Always returned in `ALLERGENS` order rather than the order the lists happened
 * to be stored in, so the chips read the same way on every product.
 */
export function allergensFor(
	product: Pick<Product, "allergens">,
	variant: Declares | null,
	options: ReadonlyArray<Pick<ProductOption, "allergens">> = [],
): Allergen[] {
	const all = gather(product, variant, options);
	return ALLERGENS.filter((allergen) => all.has(allergen));
}

/**
 * Only what this variant adds beyond the product's own list.
 *
 * For the per-flavour note in the price table, where repeating the three
 * allergens every flavour shares would bury the one that differs.
 */
export function extraAllergens(
	product: Pick<Product, "allergens">,
	variant: Declares,
	options: ReadonlyArray<Pick<ProductOption, "allergens">> = [],
): Allergen[] {
	const base = new Set(product.allergens);
	const all = gather(product, variant, options);
	return ALLERGENS.filter((allergen) => all.has(allergen) && !base.has(allergen));
}

/** "tree nuts", "tree nuts and soy", "tree nuts, soy and sesame". */
export function allergenSentence(allergens: readonly Allergen[]): string {
	const names = allergens.map((allergen) => ALLERGEN_LABELS[allergen].toLowerCase());
	if (names.length < 2) return names.join("");
	return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
