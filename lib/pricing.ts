/**
 * Bundle pricing, mirrored from `price_for_qty` in
 * supabase/migrations/*_functions.sql.
 *
 * This exists so the order form can show a live total as the customer changes
 * quantities. It is never the authority: the database recomputes every line
 * inside the transaction that writes the order, and that is the price charged.
 * If the two ever disagree, the database is right and this file has a bug.
 */
import type { PriceTier, Product, ProductVariant } from "./types";

export interface PricedQuantity {
	totalCents: number;
	/** e.g. "1 x 4 for $12.00 + 1 x $3.00 each" */
	note: string;
}

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

	return { totalCents: best[qty]!, note: parts.join(" + ") };
}

/** True when the product is sold as flavours, sizes or some other named choice. */
export function hasVariants(product: Product): boolean {
	return product.variants.length > 0;
}

/** The flavours a customer may actually pick. */
export function availableVariants(product: Product): ProductVariant[] {
	return product.variants.filter((variant) => variant.isAvailable);
}

/** The one a picker should start on, or null when there is nothing to pick. */
export function defaultVariant(product: Product): ProductVariant | null {
	return availableVariants(product)[0] ?? null;
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
	return priceForQty(unitPriceOf(product, variant), product.tiers, qty, product.unitLabel);
}

/**
 * How a product's price is advertised on a card or menu line.
 *
 *   plain item        "$5 / slice"
 *   item with tiers   "$3 each · 4 for $12"
 *   stepped item      "2 for $5"        (cookies: sold in pairs, no tier row)
 *   flavoured item    "$45 – $55 each"  (one price shown when they all match)
 */
export function priceRule(product: Product): string {
	const base = priceRange(product);

	if (product.tiers.length > 0) {
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

/** The smallest quantity a customer can put in their cart. */
export function minQty(product: Product): number {
	return product.qtyStep;
}

/**
 * The next valid quantity in the given direction, clamped to the product's step
 * and its per-order maximum. Returns 0 when stepping below the minimum, which
 * the cart treats as "remove this line".
 */
export function stepQty(product: Product, current: number, direction: 1 | -1): number {
	const next = current + product.qtyStep * direction;
	if (next < product.qtyStep) return 0;
	if (product.maxPerOrder !== null && next > product.maxPerOrder) return current;
	return next;
}

/** True when `qty` is something the database will accept for this product. */
export function isValidQty(product: Product, qty: number): boolean {
	if (!Number.isInteger(qty) || qty < 1) return false;
	if (qty % product.qtyStep !== 0) return false;
	if (product.maxPerOrder !== null && qty > product.maxPerOrder) return false;
	return true;
}
