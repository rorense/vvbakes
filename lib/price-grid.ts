/**
 * How the admin's price grid is keyed, and how it survives the option groups
 * changing underneath it.
 *
 * Lives here rather than beside the form because the form is a `.tsx`, and
 * `vitest.config.mts` matches only `lib/**` and `tests/**` `.ts` files — a test
 * put next to the component would be skipped rather than run. This is the half
 * of the grid worth executing, so it is the half that moved: the keying, and
 * everything the form works out from the grid before it submits.
 */

import { VARIANT_NAME_SEPARATOR } from "./pricing";
import type { Allergen, Product } from "./types";

/** One option, as far as this file is concerned: something with a stable key. */
export interface KeyedOption {
	key: string;
}

/** One cell: something that may already have a row in the database behind it. */
export interface IdentifiedCell {
	id: string;
}

/** Which combination a grid row is: one option from each group, in order. */
export function cellKey(combination: readonly KeyedOption[]): string {
	return combination.map((option) => option.key).join("|");
}

/**
 * The saved prices, hung onto the combinations the option groups now describe.
 *
 * A cell is keyed by the options it names, so changing which groups a product
 * has changes what every combination is called: "Chocolate" becomes "Chocolate
 * · Small" and "Chocolate · Large", and the other way about when a group is
 * taken away. Looked up by key alone, every saved price then misses and the
 * grid comes up blank.
 *
 * A blank grid is not merely inconvenient. It submits no combinations at all
 * and names every row the product has in `removedVariants`, which is the exact
 * shape `saveVariants` reads as permission to delete them — so adding a second
 * group to a product that had one used to take its whole list off the shelf and
 * report "Product saved."
 *
 * So a combination with no cell of its own inherits from the saved cell that
 * matches the most of it, provided one of the two contains the other: adding a
 * group carries each price onto every combination extending it, and removing
 * one collapses a row of them back onto the first. Half an overlap is not
 * inheritance — it is a different row — and is left alone.
 *
 * The database id is not carried the same way. Two rows cannot hold one id, so
 * it goes to whichever combination inherits it first and the rest arrive as the
 * new rows they are.
 */
export function hangCells<Cell extends IdentifiedCell>(
	combinations: readonly (readonly KeyedOption[])[],
	cells: Record<string, Cell>,
): Record<string, Cell> {
	// Nothing has moved: every combination has a cell of its own. That is every
	// render in which she is only typing prices, so it is worth leaving before
	// walking the saved cells once per combination.
	if (combinations.every((combination) => cells[cellKey(combination)])) return cells;

	const saved = Object.entries(cells).map(([key, cell]) => ({
		cell,
		options: new Set(key.split("|")),
	}));

	const hung: Record<string, Cell> = {};
	const claimed = new Set<string>();

	// Every exact match first, so that no id is taken from the combination it
	// actually belongs to by one that merely overlaps it.
	for (const combination of combinations) {
		const key = cellKey(combination);
		const cell = cells[key];
		if (!cell) continue;
		hung[key] = cell;
		if (cell.id) claimed.add(cell.id);
	}

	for (const combination of combinations) {
		const key = cellKey(combination);
		if (hung[key]) continue;

		const wanted = combination.map((option) => option.key);
		let best: Cell | null = null;
		let bestShared = 0;

		for (const { cell, options } of saved) {
			let shared = 0;
			for (const option of wanted) if (options.has(option)) shared += 1;
			// One has to contain the other. A cell sharing half of this
			// combination and half of another is neither one's price under a
			// new name.
			if (shared !== Math.min(options.size, wanted.length)) continue;
			if (shared > bestShared) {
				best = cell;
				bestShared = shared;
			}
		}

		if (!best) continue;
		const takesId = best.id !== "" && !claimed.has(best.id);
		if (takesId) claimed.add(best.id);
		hung[key] = { ...best, id: takesId ? best.id : "" };
	}

	return hung;
}

/**
 * One option in one group, being edited: "Chocolate", "3 layers".
 *
 * `id` is the database row's, and empty for one the owner has just added;
 * carrying it through the form is what lets the save update the existing row
 * instead of replacing it. `key` is React's, and unlike the id it exists from
 * the moment the row is added, which is what the price grid below is keyed on.
 *
 * `imagePath` is an object path already uploaded to storage, not a pending
 * file: the upload happens as soon as the photo is chosen, so a save only ever
 * carries the path.
 */
export interface OptionDraft {
	key: string;
	id: string;
	name: string;
	imagePath: string;
	/** What this one adds to the product's allergens, never a replacement. */
	allergens: Allergen[];
	isAvailable: boolean;
}

/** One option group, being edited: "Flavour", with its options under it. */
export interface GroupDraft {
	key: string;
	id: string;
	name: string;
	options: OptionDraft[];
}

/**
 * One priced combination — the thing a customer actually buys, and the row an
 * order points at.
 *
 * Held in a map keyed by the options it is made of rather than in a list,
 * because the grid is generated from the groups and regenerates whenever she
 * adds an option. A list would have to be reconciled by position on every
 * keystroke; a map means a combination keeps its price and its id however the
 * grid is rebuilt around it, and a combination she removes and puts back finds
 * its old price waiting.
 *
 * `imagePath` and `allergens` are carried through unseen. They belong to the
 * options now, but a product that was built before there were options has them
 * on the combination, and a save that dropped them would take a photo off a
 * product that has been showing it for months.
 */
export interface CellDraft {
	id: string;
	price: string;
	isAvailable: boolean;
	imagePath: string;
	allergens: Allergen[];
	/** Blank counts this one towards the product's minimum with the others. */
	minimum: string;
}

export const EMPTY_CELL: CellDraft = {
	id: "",
	price: "",
	isAvailable: true,
	imagePath: "",
	allergens: [],
	minimum: "",
};

/**
 * Every combination the current groups describe, in reading order: the last
 * group varies fastest, so the flavours stay together and the layers count up
 * inside them.
 */
export function combinationsOf(groups: GroupDraft[]): OptionDraft[][] {
	if (groups.length === 0) return [];

	return groups.reduce<OptionDraft[][]>(
		(combinations, group) =>
			combinations.flatMap((combination) =>
				group.options.map((option) => [...combination, option]),
			),
		[[]],
	);
}

/** What the form holds that the variant submission is worked out from. */
export interface VariantDraftInput {
	/** The product as saved, or null for a new one. */
	product: Pick<Product, "variants"> | null;
	groups: GroupDraft[];
	cells: Record<string, CellDraft>;
	/** The form's "sold in variants" switch. */
	sellsVariants: boolean;
	priceOnRequest: boolean;
	/** The product's own price box, as typed. */
	unitPrice: string;
}

/**
 * Everything the product form submits about its variants, and what it warns
 * about before it does: which combinations are offered, which saved ones this
 * save removes or newly creates, the price the product itself carries, and the
 * two JSON payloads `saveProduct` reads.
 *
 * Pure, and here rather than in the form, so it runs under the tests. The
 * comments are the form's own; they say why each rule is what it is.
 */
export function deriveVariantSubmission({
	product,
	groups,
	cells,
	sellsVariants,
	priceOnRequest,
	unitPrice,
}: VariantDraftInput) {
	const savedVariantCount = product?.variants.length ?? 0;

	// A half-typed row is not a group or an option yet. Dropping them here
	// rather than failing validation means an empty row left behind after "Add"
	// is simply ignored.
	//
	// Turning the switch off does not throw the rows away, so flicking it back on
	// in the same sitting brings them back. It does stop them being submitted,
	// which is what turns the product into a single thing on save.
	const filledGroups = sellsVariants
		? groups
				.filter((group) => group.name.trim() !== "")
				.map((group) => ({
					...group,
					options: group.options.filter((option) => option.name.trim() !== ""),
				}))
				.filter((group) => group.options.length > 0)
		: [];

	const combinations = combinationsOf(filledGroups);
	const hungCells = hangCells(combinations, cells);
	const cellFor = (combination: OptionDraft[]): CellDraft =>
		hungCells[cellKey(combination)] ?? EMPTY_CELL;

	// A combination with no price is one she does not sell: the lemon in three
	// layers, the tin in a size she stopped stocking. The grid still offers it,
	// and leaving it blank is how she says no.
	//
	// Unless there is no price to leave blank. Nothing charges a product priced
	// on request — `priceProduct` and `place_order` both stop before they reach
	// `unit_price_cents` — so the grid has nothing to ask her, and a number
	// typed into it would be a number nobody is ever shown or charged. Every
	// combination is offered, and the row's own "Sold out" is how one is taken
	// away: it greys the same pill, in the same place, as a combination she
	// never made. Which is the difference between typing a zero into every cell
	// of a nine-by-five grid and typing nothing at all.
	const offeredVariants = priceOnRequest
		? combinations
		: combinations.filter((combination) => cellFor(combination).price.trim() !== "");

	// Groups and priced combinations travel together — a group nobody can buy an
	// option from is not something the shop can render. Until one price is
	// typed this saves as a plain product, which is also how the old flat list
	// behaved when every row was left blank. Priced on request there is nothing
	// to type, so this turns instead on whether the groups describe anything.
	const submittedGroups = offeredVariants.length > 0 ? filledGroups : [];

	// Which of the product's existing combinations this save would remove: one
	// whose price has been cleared, or one whose option has been taken away.
	// Priced on request only the second of those can happen, since every
	// combination the groups describe is offered. Named out loud below so it is
	// never a surprise, and named in the submission because the save refuses to
	// delete a row nobody listed.
	const submittedIds = new Set(
		offeredVariants.map((combination) => cellFor(combination).id).filter(Boolean),
	);
	const removedVariants = (product?.variants ?? []).filter(
		(variant) => !submittedIds.has(variant.id),
	);

	// The other direction, and only where prices stopped saying which
	// combinations are real: the ones this save would newly create.
	//
	// A priced product says "I do not make this" by leaving the box blank, and
	// that hole survives every save. Priced on request there is no box, so the
	// hole is about to be filled in — and a product switched to price on request
	// and back would come out the other side offering a three layer lemon at
	// $0.00 that it has never made. Rare, but silent, which is the part worth
	// fixing: she is told which ones and can switch them to sold out before
	// saving.
	//
	// Inherited cells are not new. Adding a second group turns six combinations
	// into thirty, and `hangCells` carries each one's price onto the five that
	// extend it, so those are the same six answers under longer names rather
	// than something she has not seen. What is left here is a combination with
	// no cell at all: a hole, or an option added since the last save.
	//
	// Nothing to say on a product that has no combinations yet either. Every row
	// of a grid being filled in for the first time is new, and announcing that is
	// announcing what she is looking at.
	const addedVariants =
		priceOnRequest && savedVariantCount > 0
			? combinations.filter((combination) => !hungCells[cellKey(combination)])
			: [];

	// The product still needs a price of its own: the column is not null, and a
	// product built out of variants from the start has never had one typed into
	// it. The cheapest variant stands in, so taking every variant away later
	// leaves a price that means something rather than a zero. Anything unusable in
	// the box is ignored rather than submitted, because the box is hidden and she
	// would have no way to see what the complaint was about.
	const typedPrice = Number(unitPrice);
	const typedPriceUsable =
		unitPrice.trim() !== "" && Number.isFinite(typedPrice) && typedPrice >= 0;
	const cheapestVariant = offeredVariants
		.map((combination) => Number(cellFor(combination).price))
		.filter((price) => Number.isFinite(price) && price >= 0)
		.sort((a, b) => a - b)[0];
	const submittedUnitPrice =
		!sellsVariants || typedPriceUsable ? unitPrice : (cheapestVariant?.toString() ?? "0");

	// What the picker asks when this product is down to one group again. Kept
	// in step with the first group rather than edited separately, so a product
	// that loses its groups does not go back to asking something she renamed a
	// year ago.
	const submittedVariantLabel = filledGroups[0]?.name.trim() || "Flavour";

	const optionGroupsJson = JSON.stringify(
		submittedGroups.map((group) => ({
			id: group.id || undefined,
			name: group.name,
			options: group.options.map((option) => ({
				id: option.id || undefined,
				name: option.name,
				imagePath: option.imagePath,
				allergens: option.allergens,
				isAvailable: option.isAvailable,
			})),
		})),
	);

	const variantsJson = JSON.stringify(
		offeredVariants.map((combination) => {
			const cell = cellFor(combination);
			return {
				id: cell.id || undefined,
				name: combination.map((option) => option.name.trim()).join(VARIANT_NAME_SEPARATOR),
				// `product_variants.unit_price_cents` is not null, and priced on
				// request there is no box to have typed one into. Whatever was typed
				// before the switch went on is kept rather than flattened, for the
				// reason the product's own price field is kept: switching it back off
				// should bring the prices back, not a column of zeroes.
				unitPriceCents: priceOnRequest ? cell.price.trim() || "0" : cell.price,
				imagePath: cell.imagePath,
				allergens: cell.allergens,
				isAvailable: cell.isAvailable,
				minPerOrder: cell.minimum,
				// By position, because most of these options have no id yet: they are
				// being created by this same submission. See `productVariantSchema`.
				options: combination.map((option, group) =>
					submittedGroups[group]!.options.indexOf(option),
				),
			};
		}),
	);

	return {
		filledGroups,
		combinations,
		cellFor,
		offeredVariants,
		removedVariants,
		addedVariants,
		submittedUnitPrice,
		submittedVariantLabel,
		optionGroupsJson,
		variantsJson,
	};
}
