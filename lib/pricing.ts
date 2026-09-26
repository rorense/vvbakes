/**
 * Bundle pricing, mirrored from `price_for_qty` in
 * supabase/migrations/*_functions.sql.
 *
 * This exists so the order form can show a live total as the customer changes
 * quantities. It is never the authority: the database recomputes every line
 * inside the transaction that writes the order, and that is the price charged.
 * If the two ever disagree, the database is right and this file has a bug.
 */
import { hasCustomFlavour } from "./brief";
import type {
	CartExtra,
	Extra,
	OrderItem,
	PriceTier,
	Product,
	ProductOption,
	ProductOptionGroup,
	ProductVariant,
} from "./types";

export interface PricedQuantity {
	totalCents: number;
	/** e.g. "1 x 4 for $12.00 + 1 x $3.00 each" */
	note: string;
	/**
	 * True when there is no price yet, only a promise of one.
	 *
	 * `totalCents` is zero on such a line and must not be rendered as money:
	 * "$0.00" beside a custom cake reads as a free cake. Callers show `note`
	 * instead and leave the line out of any figure they call a total.
	 */
	onRequest: boolean;
}

/**
 * What a line with no price yet says instead of a number.
 *
 * The same string `place_order` writes into `pricing_note` for one of these
 * lines, so the basket and the order it becomes read identically.
 */
export const PRICE_ON_REQUEST_NOTE = "Price to follow";

/** How a product with no price yet is advertised on a card or a menu line. */
export const PRICE_ON_REQUEST_LABEL = "Price on request";

export function formatMoney(cents: number): string {
	return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Drops a trailing ".00" so menu prices read "$3" rather than "$3.00", but keeps
 * the cents when there are any: "$2.50".
 */
export function formatPrice(cents: number): string {
	const dollars = cents / 100;
	return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/**
 * A cheaper rate that starts once the first few are paid for.
 *
 * "The first two boxes are $17.50 each and every box after that is $15." See
 * `Product.extraUnitPriceCents` for why this is not a bundle tier.
 */
export interface AfterMinimum {
	/** How many are charged the unit price before the cheaper rate begins. */
	minimum: number;
	/** What each one after those costs. */
	unitPriceCents: number;
	/**
	 * How many of this product are already spoken for by other lines of the same
	 * order, and so have already eaten into the allowance above.
	 *
	 * Zero for a line standing on its own, which is what the product page shows
	 * and what a basket holding one flavour comes to. `priceProductLines` is
	 * what fills it in, and is the only caller that needs to.
	 */
	alreadyCounted?: number;
}

/**
 * The cheapest way to buy `qty` units, plus how that total breaks down.
 *
 * Exact, not greedy: with tiers of "4 for $12" and "3 for $8", six units cost
 * $16 as two threes, and taking the biggest bundle first would overcharge by $2.
 * Ties prefer the larger bundle so the note names what the customer picked off
 * the menu.
 *
 * `afterMinimum` is the other kind of price list and replaces the tiers rather
 * than joining them: a product priced "the first two, then the rest" has no
 * bundles to search through, and the admin refuses both at once because they
 * are two answers to the same question.
 */
export function priceForQty(
	unitPriceCents: number,
	tiers: readonly PriceTier[],
	qty: number,
	unitLabel = "each",
	afterMinimum: AfterMinimum | null = null,
): PricedQuantity {
	if (!Number.isInteger(qty) || qty < 1) {
		throw new RangeError(`quantity must be a positive integer, received ${qty}`);
	}

	if (afterMinimum) return priceAfterMinimum(unitPriceCents, qty, unitLabel, afterMinimum);

	const sorted = [...tiers].sort((a, b) => a.qty - b.qty);

	// best[i] is the cheapest total for i units; pick[i] is the bundle size used
	// to get there, or 0 for a single unit.
	const best = new Array<number>(qty + 1).fill(0);
	const pick = new Array<number>(qty + 1).fill(0);

	for (let i = 1; i <= qty; i += 1) {
		best[i] = best[i - 1]! + unitPriceCents;
		pick[i] = 0;

		for (const tier of sorted) {
			if (tier.qty > i) break;
			const candidate = best[i - tier.qty]! + tier.priceCents;
			if (candidate < best[i]! || (candidate === best[i]! && tier.qty > pick[i]!)) {
				best[i] = candidate;
				pick[i] = tier.qty;
			}
		}
	}

	// Walk the choices back and count how many of each were used.
	const counts = new Map<number, number>();
	for (let i = qty; i > 0;) {
		const size = pick[i]!;
		counts.set(size, (counts.get(size) ?? 0) + 1);
		i -= size === 0 ? 1 : size;
	}

	const parts = [...counts.entries()]
		.sort((a, b) => b[0] - a[0])
		.map(([size, count]) => {
			if (size === 0) {
				return `${count} x ${formatMoney(unitPriceCents)} ${unitLabel}`;
			}
			const tier = sorted.find((t) => t.qty === size)!;
			return `${count} x ${size} for ${formatMoney(tier.priceCents)}`;
		});

	return { totalCents: best[qty]!, note: parts.join(" + "), onRequest: false };
}

/**
 * "The first two at $17.50, everything after at $15", priced and written out.
 *
 * No search to do: which units are the dear ones is decided by counting, not by
 * looking for the cheapest arrangement. A quantity that has not reached the
 * minimum is simply that many at the unit price, which is what a basket split
 * across two flavours is made of, and why two boxes in two flavours comes to
 * the same $35 as two of one.
 *
 * The note is built to read like the bundle notes beside it: the dearer part
 * first, the same " + " between them, the same "N x $X" for singles.
 */
function priceAfterMinimum(
	unitPriceCents: number,
	qty: number,
	unitLabel: string,
	{ minimum, unitPriceCents: extraCents, alreadyCounted = 0 }: AfterMinimum,
): PricedQuantity {
	// How much of the full-price allowance is left once whatever came before has
	// taken its share. Zero on a line that starts past the minimum, which is
	// every line of a basket after the first couple.
	const allowance = Math.max(0, Math.max(1, minimum) - Math.max(0, alreadyCounted));
	const atFullPrice = Math.min(qty, allowance);
	const extra = qty - atFullPrice;

	return {
		totalCents: unitPriceCents * atFullPrice + extraCents * extra,
		note: unitsNote(
			[
				{ count: atFullPrice, cents: unitPriceCents },
				{ count: extra, cents: extraCents },
			],
			unitLabel,
		),
		onRequest: false,
	};
}

/**
 * "2 x $17.50 box of 12 + 1 x $15.00 box of 12", dearest first.
 *
 * Per unit rather than as a bundle, unlike the tier notes beside it, and that
 * is the honest way round now that the rule is about the whole order. "1 x 2
 * for $35.00" would be quoting the first two boxes as a thing this line bought,
 * when what actually happened is that the order reached its minimum and this
 * line was standing where the allowance ran out. The line did not buy a bundle;
 * it bought some boxes at one rate and some at another, and that is what this
 * says.
 */
function unitsNote(
	parts: ReadonlyArray<{ count: number; cents: number }>,
	unitLabel: string,
): string {
	return parts
		.filter((part) => part.count > 0)
		.sort((a, b) => b.cents - a.cents)
		.map((part) => `${part.count} x ${formatMoney(part.cents)} ${unitLabel}`)
		.join(" + ");
}

/**
 * One line of an order, as the thing that prices it needs to see the line.
 *
 * `variant` carries the price of one; null is a product sold as one thing.
 */
export interface LineToPrice {
	variant: ProductVariant | null;
	qty: number;
}

/**
 * What each of one product's lines comes to, priced as one order rather than
 * one at a time.
 *
 * This is the whole reason it exists. "Three or more boxes and each one past
 * the first two is $15" is a rule about the order, not about a flavour of it,
 * so three boxes come to $50 whether that is three of one or one each of three.
 * Pricing a line on its own cannot say that: each line would start its own
 * allowance over and three flavours would come to $52.50.
 *
 * The allowance goes to the cheapest units first, which is what leaves the
 * customer paying the least, and is the same side `priceForQty` already takes
 * when it searches the bundle table for the cheapest way to make a quantity up.
 * Ties fall back to the order the lines arrived in, so the answer is stable and
 * the browser and the database can agree on it.
 *
 * Products with no cheaper rate past the minimum are priced exactly as before,
 * one line at a time, because for them a line really is the whole story.
 *
 * Returns one entry per line, in the order the lines were given.
 */
export function priceProductLines(
	product: Product,
	lines: readonly LineToPrice[],
	/**
	 * How many of this product the order already holds outside `lines`.
	 *
	 * Zero for the basket, which is handed every line there is. The product page
	 * passes what the basket is already holding, so that a second visit to the
	 * page quotes the boxes it is about to add at the rate they will actually be
	 * charged rather than starting the allowance again.
	 */
	alreadyCounted = 0,
): PricedQuantity[] {
	if (product.priceOnRequest || product.extraUnitPriceCents === null) {
		return lines.map((line) => priceProduct(product, line.qty, line.variant));
	}

	const minimum = minOrderQty(product);

	// Cheapest first, then the biggest quantity, then the flavour's id.
	//
	// The order matters because the allowance runs out inside one of these
	// lines, and which line that is decides how the total is split between them.
	// The total itself never changes. `place_order` sorts on the same three
	// things, which is what keeps each line's own figure the same on this page
	// and on the order it becomes; see the comment there for the one case the
	// three cannot separate, and for why it does not change what anybody pays.
	const order = lines
		.map((line, index) => ({
			index,
			cents: unitPriceOf(product, line.variant),
			qty: line.qty,
			id: line.variant?.id ?? "",
		}))
		.sort((a, b) => a.cents - b.cents || b.qty - a.qty || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

	const priced = new Array<PricedQuantity>(lines.length);
	let counted = Math.max(0, alreadyCounted);

	for (const { index } of order) {
		const line = lines[index]!;
		priced[index] = priceForQty(
			unitPriceOf(product, line.variant),
			product.tiers,
			line.qty,
			product.unitLabel,
			{
				minimum,
				unitPriceCents: product.extraUnitPriceCents,
				alreadyCounted: counted,
			},
		);
		counted += line.qty;
	}

	return priced;
}

/** True when the product is sold as flavours, sizes or some other named choice. */
export function hasVariants(product: Product): boolean {
	return product.variants.length > 0;
}

/**
 * The separator between the options in a variant's name: "Chocolate · 3 layers".
 *
 * Written into `product_variants.name` by the admin and read back everywhere
 * else, including by an order placed a year ago, so it is a constant rather
 * than something each renderer picks for itself.
 */
export const VARIANT_NAME_SEPARATOR = " · ";

/**
 * The option groups this product offers, whether or not it has said so out loud.
 *
 * A product with two — flavour and layers — stores them as real rows. A product
 * with one stores nothing: the group is `product.variantLabel` and its options
 * are the variants themselves, which is how every product worked before a
 * second group was possible, and how most of them will keep working.
 *
 * Rather than making every caller handle both, the single-group case is dressed
 * up as one group here. Its `id` is empty, which is what marks it as having no
 * row behind it; its options borrow the variants' ids, names, photos, allergens
 * and availability, because for that product an option and a variant are the
 * same thing. Nothing downstream needs to know which kind it got.
 */
export function optionGroups(product: Product): ProductOptionGroup[] {
	if (product.optionGroups.length > 0) return product.optionGroups;
	if (product.variants.length === 0) return [];

	return [
		{
			id: "",
			name: product.variantLabel,
			sortOrder: 0,
			options: product.variants.map((variant) => ({
				id: variant.id,
				name: variant.name,
				imagePath: variant.imagePath,
				allergens: variant.allergens,
				isAvailable: variant.isAvailable,
				sortOrder: variant.sortOrder,
			})),
		},
	];
}

/**
 * Which options a variant is made of, as ids.
 *
 * The stored list, except for a product with one option group, where the
 * variant is its own option. See `optionGroups`.
 */
export function variantOptionIds(product: Product, variant: ProductVariant): string[] {
	return product.optionGroups.length > 0 ? variant.optionIds : [variant.id];
}

/** The options a variant is made of, as rows, in the order the groups offer. */
export function variantOptions(product: Product, variant: ProductVariant): ProductOption[] {
	const ids = new Set(variantOptionIds(product, variant));
	return optionGroups(product)
		.flatMap((group) => group.options)
		.filter((option) => ids.has(option.id));
}

/**
 * True when a customer can put this exact combination in their basket.
 *
 * Two switches have to agree: the combination's own, and the one on every
 * option it is made of. Selling out of carrots takes "Carrot · 1 layer" and
 * "Carrot · 3 layers" with it, which is the whole reason the options carry a
 * switch of their own rather than making her find all three rows.
 *
 * `place_order` checks the same pair inside the transaction that writes the
 * order, so a basket that went stale between filling and submitting is refused
 * rather than baked.
 */
export function isVariantAvailable(product: Product, variant: ProductVariant): boolean {
	if (!variant.isAvailable) return false;

	const options = variantOptions(product, variant);

	// A combination that no longer draws from every group is gone rather than
	// cheap. Deleting an option takes the links to it with it and leaves the
	// combination behind half-described, and no selection on the page can name
	// that, so it must not go on quoting a price from the menu either.
	if (options.length !== optionGroups(product).length) return false;

	return options.every((option) => option.isAvailable);
}

/** The flavours a customer may actually pick. */
export function availableVariants(product: Product): ProductVariant[] {
	return product.variants.filter((variant) => isVariantAvailable(product, variant));
}

/** The one a picker should start on, or null when there is nothing to pick. */
export function defaultVariant(product: Product): ProductVariant | null {
	return availableVariants(product)[0] ?? null;
}

/**
 * Which option is chosen in each group, keyed by group id.
 *
 * The shape the pickers hold and `variantFor` reads. A group whose id is empty
 * is the implied single group, and an empty string is a perfectly good key for
 * the one entry such a product ever has.
 */
export type OptionSelection = Record<string, string>;

/** The combination this selection names, or null when there is no such row. */
export function variantFor(product: Product, selection: OptionSelection): ProductVariant | null {
	const wanted = optionGroups(product).map((group) => selection[group.id]);
	if (wanted.some((id) => !id)) return null;

	const ids = new Set(wanted as string[]);

	return (
		product.variants.find((variant) => {
			const has = variantOptionIds(product, variant);
			return has.length === ids.size && has.every((id) => ids.has(id));
		}) ?? null
	);
}

/** The options that make up a variant, as a selection a picker can start from. */
export function selectionFor(product: Product, variant: ProductVariant | null): OptionSelection {
	const selection: OptionSelection = {};
	if (!variant) return selection;

	const ids = new Set(variantOptionIds(product, variant));
	for (const group of optionGroups(product)) {
		const option = group.options.find((one) => ids.has(one.id));
		if (option) selection[group.id] = option.id;
	}
	return selection;
}

/** Where a picker starts: the first combination a customer could actually buy. */
export function defaultSelection(product: Product): OptionSelection {
	return selectionFor(product, defaultVariant(product) ?? product.variants[0] ?? null);
}

/**
 * True when picking this option leads somewhere, given what is already picked.
 *
 * A matrix is allowed to have holes — the owner may simply not sell a three
 * layer lemon, or may have sold out of it — and an option that cannot be
 * combined with the current ones is offered greyed out rather than silently
 * leading to "not available" after the click. Only the *other* groups' options
 * are held fixed, so picking a flavour never disables the flavour itself.
 *
 * A product with one group has nothing to hold fixed, so every option the
 * picker is given is selectable and nothing is ever greyed: the picker is only
 * given options that are on sale in the first place.
 */
export function isOptionSelectable(
	product: Product,
	selection: OptionSelection,
	groupId: string,
	optionId: string,
): boolean {
	const variant = variantFor(product, { ...selection, [groupId]: optionId });
	return variant !== null && isVariantAvailable(product, variant);
}

/**
 * True when a customer can actually put this in their basket right now.
 *
 * A flavoured product with every flavour switched off is sold out even though
 * the product itself still says available, and the shop has to say so rather
 * than offer a picker with nothing in it.
 */
export function isOrderable(product: Product): boolean {
	if (!product.isAvailable) return false;
	return !hasVariants(product) || availableVariants(product).length > 0;
}

/**
 * The variant with this id, or null.
 *
 * Deliberately tolerant of an id that no longer matches anything: the cart is
 * localStorage and can name a flavour the owner deleted last week. Callers
 * treat null as "this line is stale" and drop it.
 */
export function findVariant(product: Product, variantId: string | null | undefined) {
	if (!variantId) return null;
	return product.variants.find((variant) => variant.id === variantId) ?? null;
}

/**
 * What one unit of this line costs: the variant's price when there is one, the
 * product's own otherwise.
 */
export function unitPriceOf(product: Product, variant: ProductVariant | null): number {
	return variant ? variant.unitPriceCents : product.unitPriceCents;
}

/**
 * Convenience wrapper for a whole product.
 *
 * Bundle tiers belong to the product and are applied on top of whichever unit
 * price is in play, so "4 for $12" means four of *this* flavour. Mixing
 * flavours inside one bundle is a different promise and nothing here makes it.
 */
export function priceProduct(
	product: Product,
	qty: number,
	variant: ProductVariant | null = null,
): PricedQuantity {
	// Nothing to price and nothing to bundle. `place_order` short-circuits the
	// same way and writes the same note, so the number the basket shows and the
	// number the order carries are the same number: none.
	if (product.priceOnRequest) {
		return { totalCents: 0, note: PRICE_ON_REQUEST_NOTE, onRequest: true };
	}
	return priceForQty(
		unitPriceOf(product, variant),
		product.tiers,
		qty,
		product.unitLabel,
		afterMinimumOf(product),
	);
}

/**
 * The product's "and the rest at" rate, ready to price with, or null.
 *
 * The threshold is `minOrderQty` rather than `minPerOrder` itself, so a product
 * with no minimum still has an answer (its step size), and a minimum that was
 * rounded up to a whole step is the same number here as everywhere else.
 *
 * The rate is the product's even where a flavour is priced away from it, the
 * way a bundle tier is. The admin's price preview shows her what each flavour
 * comes to before she saves.
 */
export function afterMinimumOf(product: Product): AfterMinimum | null {
	if (product.extraUnitPriceCents === null) return null;
	return { minimum: minOrderQty(product), unitPriceCents: product.extraUnitPriceCents };
}

// --- what a placed order comes to -------------------------------------------
//
// Everything above is about the menu: what a thing costs before anyone orders
// it. These three are about an order that exists, and they live here because
// the customer's order page, the admin's copy of it and all five emails have
// to agree on them to the cent. They each held their own copy, and the header
// on components/order/OrderLines.tsx says what that risks: the price the
// customer reads and the price the owner reads drifting apart is the one
// disagreement this shop cannot afford.

/**
 * What one line came to in total: the menu price plus everything added to it.
 *
 * The two are stored apart — `lineTotalCents` is what `pricingNote` explains,
 * and an extra is its own snapshotted row — so the sum is made here rather
 * than baked into either. `place_order` adds them the same way when it writes
 * the order's subtotal, so the figure beside each line and the total at the
 * bottom agree.
 */
export function lineTotalWithExtras(item: Pick<OrderItem, "lineTotalCents" | "extras">): number {
	return item.extras.reduce((total, extra) => total + extra.lineTotalCents, item.lineTotalCents);
}

/**
 * True when something on this order was placed with no price on it, and
 * nothing has been quoted against it yet.
 *
 * Not the same question as "does the total read zero": a custom cake beside
 * $24 of cupcakes leaves a total that is real, is not nothing, and is still
 * missing the cake. That is what makes the figure read "So far" rather than
 * "Total". The moment she quotes, the total is the whole total again and none
 * of it needs saying.
 */
export function hasUnpricedWork(
	items: ReadonlyArray<Pick<OrderItem, "priceOnRequest">>,
	quoteCents: number,
): boolean {
	return items.some((item) => item.priceOnRequest) && quoteCents === 0;
}

/**
 * True when something here was asked for in a flavour of its own and she has
 * not decided yet whether that costs more.
 *
 * A different sentence from `hasUnpricedWork`, and deliberately a weaker one:
 * the figure above is a real, complete price. It is only a price she is
 * allowed to add to once she has read what is being asked, which the shop said
 * out loud before the order was placed. Follows the same rule about quoting,
 * for the same reason.
 */
export function couldCostMore(
	items: ReadonlyArray<Pick<OrderItem, "customFlavour" | "frosting" | "frostingMatchesFlavour">>,
	quoteCents: number,
): boolean {
	return items.some(hasCustomFlavour) && quoteCents === 0;
}

// --- extras -----------------------------------------------------------------

/**
 * The extras a customer may actually pick right now.
 *
 * One list for the whole shop, so this is the same answer on every product
 * page. An empty result hides the picker rather than showing an empty heading.
 */
export function availableExtras(extras: readonly Extra[]): Extra[] {
	return extras.filter((extra) => extra.isAvailable);
}

/**
 * One extra a customer has picked, resolved against the product's own list.
 *
 * `qty` is how many of it per unit of the line, already clamped to what the
 * product allows. Kept beside the extra rather than folded into it because the
 * extra is the owner's row and the count is the customer's answer.
 */
export interface ChosenExtra {
	extra: Extra;
	qty: number;
}

/**
 * The same picks, de-duplicated and sorted by id.
 *
 * Two extras picked in one order and the same two picked in the other are one
 * choice, so the cart has to write them down the same way or it ends up with
 * two lines of the same thing. An id given twice is one pick at the larger
 * count, and a count below one is one. `place_order` reduces them exactly the
 * same way inside the transaction, which is what makes the two agree.
 */
export function normaliseExtras(chosen: readonly CartExtra[] | null | undefined): CartExtra[] {
	const counts = new Map<string, number>();

	for (const pick of chosen ?? []) {
		const qty = Number.isInteger(pick.qty) ? Math.max(1, pick.qty) : 1;
		counts.set(pick.id, Math.max(counts.get(pick.id) ?? 0, qty));
	}

	return [...counts]
		.map(([id, qty]) => ({ id, qty }))
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * One of each of these ids, which is what a basket saved before quantities
 * existed means by naming them.
 */
export function extrasFromIds(ids: readonly string[] | null | undefined): CartExtra[] {
	return (ids ?? []).map((id) => ({ id, qty: 1 }));
}

/**
 * The extras these picks name, in the owner's order, with their counts.
 *
 * Deliberately tolerant of an id that no longer matches anything, for the same
 * reason `findVariant` is: the cart is localStorage and can still be holding a
 * candle she stopped selling last week. What comes back is what is still real,
 * and the caller decides whether a line that lost one is worth keeping.
 *
 * A count above what the product now allows is clamped rather than dropped.
 * The cap is hers to lower after a basket was filled, and six candles instead
 * of ten is much closer to what was asked for than no candles — and closer
 * still than a basket that cannot be submitted, which is what sending the ten
 * on to `place_order` would produce.
 */
export function findExtras(
	extras: readonly Extra[],
	chosen: readonly CartExtra[] | null | undefined,
): ChosenExtra[] {
	const wanted = new Map((chosen ?? []).map((pick) => [pick.id, pick.qty]));

	return extras
		.filter((extra) => wanted.has(extra.id))
		.map((extra) => ({ extra, qty: clampExtraQty(extra, wanted.get(extra.id) ?? 1) }));
}

/** How many of this extra a customer may add, between one and the cap. */
export function clampExtraQty(extra: Extra, qty: number): number {
	if (!Number.isInteger(qty)) return 1;
	return Math.min(Math.max(1, qty), Math.max(1, extra.maxQty));
}

/** What one unit's worth of these extras costs, counts and all. */
export function extrasUnitCents(chosen: readonly ChosenExtra[]): number {
	return chosen.reduce((total, { extra, qty }) => total + extra.priceCents * qty, 0);
}

/**
 * What these extras add to a line of `qty`.
 *
 * Per unit, not per line: two cakes with candles is two sets of candles, which
 * is what someone ordering two cakes for two parties means. Bundle tiers do not
 * apply — a bundle is the owner's price for several of one product, and she has
 * not been asked for a price on four sets of candles.
 */
export function extrasTotalCents(chosen: readonly ChosenExtra[], qty: number): number {
	return extrasUnitCents(chosen) * qty;
}

/**
 * How one extra reads beside its own name: "+$3.00 each", or just "Free".
 *
 * "each" is left off when there is nothing to distinguish it from, so a picker
 * on a product ordered one at a time does not imply a second price.
 *
 * Always the price of *one* of them, even where several can be added: the
 * number beside the picker is the count, and multiplying the two in the label
 * as well would say the same thing twice and disagree with it the moment the
 * count changed.
 */
export function extraPriceLabel(
	extra: Extra,
	{ perUnit = true }: { perUnit?: boolean } = {},
): string {
	if (extra.priceCents === 0) return "Free";
	return perUnit ? `+${formatPrice(extra.priceCents)} each` : `+${formatPrice(extra.priceCents)}`;
}

/**
 * How an extra is named wherever it is listed: "Candles", or "Candles × 6".
 *
 * The count is left off at one rather than written out, because "Gift box × 1"
 * is noise on the thing it describes. Said the same way in the basket, on the
 * order page, in the admin and in all five emails, which is why it is here and
 * not in any one of them.
 */
export function extraLabel(name: string, qty: number): string {
	return qty > 1 ? `${name} × ${qty}` : name;
}

/**
 * How a product's price is advertised on a card or menu line.
 *
 *   plain item        "$5 / slice"
 *   item with tiers   "$3 each · 4 for $12"
 *   stepped item      "2 for $5"        (cookies: sold in pairs, no tier row)
 *   flavoured item    "$45 – $55 each"  (one price shown when they all match)
 *
 * Pass `bundles: false` where the line has room for one price only, as a card
 * in a four-up grid does. The bundles are still priced and still applied; the
 * product page is where they are named.
 */
export function priceRule(
	product: Product,
	{ bundles = true }: { bundles?: boolean } = {},
): string {
	// No price, so no per-unit price, no bundles and no step price either: every
	// branch below would be quoting the placeholder in `unitPriceCents`.
	if (product.priceOnRequest) return PRICE_ON_REQUEST_LABEL;

	const base = priceRange(product);

	// Said before the bundles because a product has one or the other, never both,
	// and this is the one that has no row of its own in the price table on the
	// product page when the product is sold by the flavour.
	if (bundles && product.extraUnitPriceCents !== null) {
		return `${base} · ${formatPrice(product.extraUnitPriceCents)} each after ${minOrderQty(product)}`;
	}

	if (bundles && product.tiers.length > 0) {
		const tiers = [...product.tiers]
			.sort((a, b) => a.qty - b.qty)
			.map((tier) => `${tier.qty} for ${formatPrice(tier.priceCents)}`);
		return [base, ...tiers].join(" · ");
	}

	if (product.qtyStep > 1 && !hasVariants(product)) {
		// A stepped product has no meaningful single-unit price to advertise.
		return `${product.qtyStep} for ${formatPrice(product.unitPriceCents * product.qtyStep)}`;
	}

	return base;
}

/**
 * The price half of `priceRule`, before any bundles are named.
 *
 * A product whose flavours are all the same price reads as one price, because
 * that is what it is; only a genuine spread is worth two numbers and a dash.
 * Sold-out flavours are left out: quoting a range a customer cannot buy either
 * end of is worse than quoting nothing.
 */
export function priceRange(product: Product): string {
	if (product.priceOnRequest) return PRICE_ON_REQUEST_LABEL;

	const suffix = product.unitLabel === "each" ? "each" : `/ ${product.unitLabel}`;
	return `${unitPriceRange(product)} ${suffix}`;
}

/**
 * What one costs, as money and nothing else: "$17.50", or "$45 – $55".
 *
 * `priceRange` with the unit left off, for the places that have already said
 * what is being counted: a price table whose rows name the quantity, where
 * "$17.50 / box of 12" in the price column would say "box of 12" twice.
 */
export function unitPriceRange(product: Product): string {
	const { low, high } = unitPriceBounds(product);
	return priceSpan(low, high);
}

/** The cheapest and the dearest one of this, among what can be bought. */
function unitPriceBounds(product: Product): { low: number; high: number } {
	if (!hasVariants(product)) return { low: product.unitPriceCents, high: product.unitPriceCents };

	const choices = availableVariants(product);
	const prices = (choices.length > 0 ? choices : product.variants).map((v) => v.unitPriceCents);
	return { low: Math.min(...prices), high: Math.max(...prices) };
}

/** "$35", or "$34 – $40" where the two ends differ. */
function priceSpan(low: number, high: number): string {
	return low === high ? formatPrice(low) : `${formatPrice(low)} – ${formatPrice(high)}`;
}

/** One row of the price table on a product page. */
export interface PriceTableRow {
	label: string;
	price: string;
}

/**
 * The price table's rows for a product priced "the first few, then the rest",
 * or null for any other product.
 *
 *   "First two boxes (total)"   $35
 *   "Additional box"            $15
 *
 * The first row is what the minimum comes to, not one unit of it, because the
 * minimum is the smallest order: nobody is buying the first box of minis on its
 * own. It is totalled from the flavours, for the reason `unitPriceRange` reads
 * them, and a genuine spread between them comes out as two totals and a dash.
 *
 * The words are made from the unit label and the minimum rather than written
 * in, so another product priced this way reads as itself: "slice" gives "First
 * four slices (total)" and "Additional slice". "each" counts nothing by name,
 * so it keeps the wording this table had before.
 */
export function afterMinimumRows(
	product: Product,
): { first: PriceTableRow; after: PriceTableRow } | null {
	if (product.priceOnRequest || product.extraUnitPriceCents === null) return null;

	const minimum = minOrderQty(product);
	const noun = unitNoun(product.unitLabel);
	const { low, high } = unitPriceBounds(product);
	// Spelled out while it is a small number, the way she says it.
	const count = NUMBER_WORDS[minimum] ?? String(minimum);

	return {
		first: {
			// One is not a total of anything, so it is simply the first.
			label:
				minimum === 1
					? `First ${noun ?? "one"}`
					: `First ${count}${noun ? ` ${pluralOf(noun)}` : ""} (total)`,
			price: priceSpan(low * minimum, high * minimum),
		},
		after: {
			label: noun ? `Additional ${noun}` : "Each one after that",
			price: formatPrice(product.extraUnitPriceCents),
		},
	};
}

const NUMBER_WORDS: Readonly<Record<number, string>> = {
	2: "two",
	3: "three",
	4: "four",
	5: "five",
	6: "six",
	7: "seven",
	8: "eight",
	9: "nine",
	10: "ten",
};

/**
 * The thing a unit label counts, singular: "box" out of "box of 12", "slice"
 * out of "slice". Null for "each", which names nothing to count.
 */
function unitNoun(unitLabel: string): string | null {
	const noun = unitLabel.trim().toLowerCase().split(" of ")[0]!.trim();
	return noun === "" || noun === "each" ? null : noun;
}

/** "boxes", "slices", "trays", "pastries": the regular plurals a unit label uses. */
function pluralOf(noun: string): string {
	if (/(s|x|z|ch|sh)$/.test(noun)) return `${noun}es`;
	if (/[^aeiou]y$/.test(noun)) return `${noun.slice(0, -1)}ies`;
	return `${noun}s`;
}

/**
 * The least of this product an order may contain, counted across every
 * variant.
 *
 * Not the same as `minQty`, which is the floor for one line. A minimum of six
 * cupcakes is met by three chocolate and three vanilla, so the rule belongs to
 * the basket rather than to either line, and `place_order` counts it the same
 * way. Rounded up to a whole step defensively: the database already refuses a
 * minimum that is not a multiple of one.
 *
 * A combination carrying a minimum of its own answers for itself instead, and
 * is left out of the product's count. That is the chiffon: eight is a rule
 * about slices, and the whole cake beside them is one cake. Pass the
 * combination being asked about, or leave it out to ask about the product.
 */
export function minOrderQty(product: Product, variant?: ProductVariant | null): number {
	const minimum = variant?.minPerOrder ?? product.minPerOrder;
	if (minimum === null) return product.qtyStep;
	const steps = Math.ceil(minimum / product.qtyStep);
	return Math.max(product.qtyStep, steps * product.qtyStep);
}

/**
 * True when `qty` is something the database will accept for this one line.
 *
 * The per-order minimum is deliberately not checked here. It is a rule about
 * the whole product, and a basket split across two flavours can meet it
 * without either line doing so, so checking it here would throw away half a
 * legitimate basket. See `minOrderQty`.
 */
export function isValidQty(product: Product, qty: number): boolean {
	if (!Number.isInteger(qty) || qty < 1) return false;
	if (qty % product.qtyStep !== 0) return false;
	return true;
}
