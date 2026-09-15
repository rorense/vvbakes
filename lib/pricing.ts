/**
 * Bundle pricing, mirrored from `price_for_qty` in
 * supabase/migrations/*_functions.sql.
 *
 * This exists so the order form can show a live total as the customer changes
 * quantities. It is never the authority: the database recomputes every line
 * inside the transaction that writes the order, and that is the price charged.
 * If the two ever disagree, the database is right and this file has a bug.
 */
import type {
	Extra,
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
 * The cheapest way to buy `qty` units, plus how that total breaks down.
 *
 * Exact, not greedy: with tiers of "4 for $12" and "3 for $8", six units cost
 * $16 as two threes, and taking the biggest bundle first would overcharge by $2.
 * Ties prefer the larger bundle so the note names what the customer picked off
 * the menu.
 */
export function priceForQty(
	unitPriceCents: number,
	tiers: readonly PriceTier[],
	qty: number,
	unitLabel = "each",
): PricedQuantity {
	if (!Number.isInteger(qty) || qty < 1) {
		throw new RangeError(`quantity must be a positive integer, received ${qty}`);
	}

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

/** True when the product is sold as flavours, sizes or some other named choice. */
export function hasVariants(product: Product): boolean {
	return product.variants.length > 0;
}

/**
 * The separator between the answers in a variant's name: "Chocolate · 3 layers".
 *
 * Written into `product_variants.name` by the admin and read back everywhere
 * else, including by an order placed a year ago, so it is a constant rather
 * than something each renderer picks for itself.
 */
export const VARIANT_NAME_SEPARATOR = " · ";

/**
 * The questions this product asks, whether or not it has said so out loud.
 *
 * A product that asks two — flavour and layers — stores them as real rows. A
 * product that asks one does not store anything: the question is
 * `product.variantLabel` and the answers are the variants themselves, which is
 * how every product worked before a second question was possible, and how most
 * of them will keep working.
 *
 * Rather than making every caller handle both, the single-question case is
 * dressed up as one group here. Its `id` is empty, which is what marks it as
 * having no row behind it; its options borrow the variants' ids, names, photos,
 * allergens and availability, because for that product an answer and a variant
 * are the same thing. Nothing downstream needs to know which kind it got.
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
 * Which answers a variant is made of, as ids.
 *
 * The stored list, except for a product that asks one question, where the
 * variant is its own answer. See `optionGroups`.
 */
export function variantOptionIds(product: Product, variant: ProductVariant): string[] {
	return product.optionGroups.length > 0 ? variant.optionIds : [variant.id];
}

/** The answers a variant is made of, as rows, in the order the groups ask. */
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
 * answer it is made of. Selling out of carrots takes "Carrot · 1 layer" and
 * "Carrot · 3 layers" with it, which is the whole reason the answers carry a
 * switch of their own rather than making her find all three rows.
 *
 * `place_order` checks the same pair inside the transaction that writes the
 * order, so a basket that went stale between filling and submitting is refused
 * rather than baked.
 */
export function isVariantAvailable(product: Product, variant: ProductVariant): boolean {
	if (!variant.isAvailable) return false;

	const options = variantOptions(product, variant);

	// A combination that no longer answers every question is gone rather than
	// cheap. Deleting an answer takes the links to it with it and leaves the
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
 * Which answer is chosen for each question, keyed by group id.
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

/** The answers that make up a variant, as a selection a picker can start from. */
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
 * True when picking this answer leads somewhere, given what is already picked.
 *
 * A matrix is allowed to have holes — the owner may simply not sell a three
 * layer lemon, or may have sold out of it — and an answer that cannot be
 * combined with the current ones is offered greyed out rather than silently
 * leading to "not available" after the click. Only the *other* groups' answers
 * are held fixed, so picking a flavour never disables the flavour itself.
 *
 * A product with one question has nothing to hold fixed, so every answer the
 * picker is given is selectable and nothing is ever greyed: the picker is only
 * given answers that are on sale in the first place.
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
	return priceForQty(unitPriceOf(product, variant), product.tiers, qty, product.unitLabel);
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
 * The same ids, de-duplicated and sorted.
 *
 * Two extras picked in one order and the same two picked in the other are one
 * choice, so the cart has to write them down the same way or it ends up with
 * two lines of the same thing. `place_order` reduces them the same way inside
 * the transaction, which is what makes the two agree.
 */
export function normaliseExtraIds(ids: readonly string[] | null | undefined): string[] {
	return [...new Set(ids ?? [])].sort();
}

/**
 * The extras these ids name, in the owner's order.
 *
 * Deliberately tolerant of an id that no longer matches anything, for the same
 * reason `findVariant` is: the cart is localStorage and can still be holding a
 * candle she stopped selling last week. What comes back is what is still real,
 * and the caller decides whether a line that lost one is worth keeping.
 */
export function findExtras(extras: readonly Extra[], ids: readonly string[] | null | undefined) {
	const wanted = new Set(ids ?? []);
	return extras.filter((extra) => wanted.has(extra.id));
}

/** What one unit's worth of these extras costs. */
export function extrasUnitCents(chosen: readonly Extra[]): number {
	return chosen.reduce((total, extra) => total + extra.priceCents, 0);
}

/**
 * What these extras add to a line of `qty`.
 *
 * Per unit, not per line: two cakes with candles is two sets of candles, which
 * is what someone ordering two cakes for two parties means. Bundle tiers do not
 * apply — a bundle is the owner's price for several of one product, and she has
 * not been asked for a price on four sets of candles.
 */
export function extrasTotalCents(chosen: readonly Extra[], qty: number): number {
	return extrasUnitCents(chosen) * qty;
}

/**
 * How one extra reads beside its own name: "+$3.00 each", or just "Free".
 *
 * "each" is left off when there is nothing to distinguish it from, so a picker
 * on a product ordered one at a time does not imply a second price.
 */
export function extraPriceLabel(
	extra: Extra,
	{ perUnit = true }: { perUnit?: boolean } = {},
): string {
	if (extra.priceCents === 0) return "Free";
	return perUnit ? `+${formatPrice(extra.priceCents)} each` : `+${formatPrice(extra.priceCents)}`;
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

	if (!hasVariants(product)) {
		return `${formatPrice(product.unitPriceCents)} ${suffix}`;
	}

	const choices = availableVariants(product);
	const prices = (choices.length > 0 ? choices : product.variants).map((v) => v.unitPriceCents);
	const low = Math.min(...prices);
	const high = Math.max(...prices);

	return low === high
		? `${formatPrice(low)} ${suffix}`
		: `${formatPrice(low)} – ${formatPrice(high)} ${suffix}`;
}

/** The smallest quantity one line of this product can hold. */
export function minQty(product: Product): number {
	return product.qtyStep;
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
 */
export function minOrderQty(product: Product): number {
	if (product.minPerOrder === null) return product.qtyStep;
	const steps = Math.ceil(product.minPerOrder / product.qtyStep);
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
