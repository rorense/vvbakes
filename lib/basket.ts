import { hasCustomFlavour } from "./brief";
import { cartLineKey, lineExtras } from "./cart";
import {
	extrasTotalCents,
	findExtras,
	findVariant,
	hasVariants,
	isValidQty,
	isVariantAvailable,
	normaliseExtras,
	priceProductLines,
	type ChosenExtra,
	type PricedQuantity,
} from "./pricing";
import type { CartBrief, CartExtra, CartLine, Product, ProductVariant } from "./types";

/**
 * What the basket comes to.
 *
 * Two places show it: the order form, line by line, and the bar a phone keeps
 * at the foot of every other page, as one figure. They used to be one place,
 * and this was the middle of the order form. It moved here rather than being
 * copied because the bar's figure and the form's are the same figure, and the
 * one thing this shop cannot have is a customer reading two different totals
 * for one basket a tap apart.
 *
 * Like everything in lib/pricing.ts, this is never the authority. The database
 * prices the order again when it is written, and that is what gets charged.
 */

/**
 * One saved line as the cart itself holds it, stale ids and all.
 *
 * Removing or re-counting a line has to match on this, not on what survived,
 * or the cart would be asked to change a line it does not have.
 */
export interface BasketSource {
	variantId: string | null;
	extras: CartExtra[];
	brief: CartBrief | undefined;
}

/** One line of the basket, resolved against the live catalogue and priced. */
export interface BasketLine {
	/** What makes it its own line, after anything stale has been taken off. */
	key: string;
	product: Product;
	variant: ProductVariant | null;
	/** The extras that are still on sale, in the owner's order. */
	extras: ChosenExtra[];
	/** How many extras the saved lines asked for that are no longer on sale. */
	lostExtras: number;
	brief: CartBrief | undefined;
	qty: number;
	/** Every saved line that fed this one; more than one where they merged. */
	sources: BasketSource[];
	/** Explains the menu price and only the menu price, as `pricing_note` does. */
	note: string;
	/**
	 * True for a cake nobody has priced yet. Its menu price is zero and must not
	 * be rendered as money; `totalCents` is whatever its extras come to.
	 */
	onRequest: boolean;
	extrasCents: number;
	/** The menu price plus the extras. */
	totalCents: number;
}

export interface Basket {
	lines: BasketLine[];
	/** Saved lines that no longer resolve to anything that can be bought. */
	dropped: number;
	/** Everything the lines come to, before any delivery fee. */
	subtotalCents: number;
	/**
	 * Something in the basket has no price yet, so the subtotal is a figure for
	 * everything else and has to say so wherever it appears.
	 */
	hasUnpriced: boolean;
	/**
	 * Something in it was asked for in a flavour of its own, which is a real
	 * price the owner may add to rather than half of one. A different sentence,
	 * said in the same place. Repeated on the order page once it is placed,
	 * where it stops the moment she decides what it costs.
	 */
	mayCostMore: boolean;
}

/**
 * Prices the saved lines against the products that are on sale now.
 *
 * `products` may be any list that includes everything on sale. A line naming a
 * product that is missing from it, or that is no longer available, is dropped
 * either way, so a caller is free to leave the sold-out ones out.
 */
export function priceBasket(
	saved: readonly CartLine[],
	products: ReadonlyMap<string, Product>,
): Basket {
	// Cart lines resolved against the live catalogue. A product that has since
	// been deleted or sold out drops out here rather than failing on submit, and
	// so does a flavour that has: the basket outlives the menu it was filled
	// from, and the two have to be reconciled somewhere.
	//
	// An extra that has gone is the one thing that does *not* take its line with
	// it. Someone who wanted candles on a cake still wants the cake, so the extra
	// is dropped, counted, and said out loud on the order form. A brief is never
	// dropped: it is the customer's own words, and there is nothing in it to go
	// stale.
	const resolved = saved
		.map((line) => {
			const product = products.get(line.productId);
			if (!product || !product.isAvailable) return null;
			if (!isValidQty(product, line.qty)) return null;

			const variant = findVariant(product, line.variantId);
			// A flavoured product needs one that still exists and is still on
			// sale, answers included: a combination whose flavour has since sold
			// out is gone even though its own switch is still on. A plain product
			// is checked against the id the cart actually holds, not against
			// `variant`, which is null either way: a saved line naming a flavour
			// the owner has since removed altogether would otherwise sail through
			// here and be refused on submit.
			if (
				hasVariants(product)
					? !variant || !isVariantAvailable(product, variant)
					: Boolean(line.variantId)
			) {
				return null;
			}

			// Resolved against this product's own list, not a shop-wide one: an id
			// that belongs to another product names nothing here, which is the
			// same answer `place_order` gives it.
			//
			// `findExtras` hands them back in the owner's order rather than in
			// whatever order the cart's ids sort into. That is the order the
			// product page offered them in and the order the confirmation email
			// and the order page list them in, so the basket agrees with all three
			// instead of being the one place they came out shuffled.
			const wanted = normaliseExtras(lineExtras(line));
			const chosen = findExtras(product.extras, wanted).filter(({ extra }) => extra.isAvailable);

			return {
				source: {
					variantId: line.variantId ?? null,
					extras: lineExtras(line),
					brief: line.brief,
				},
				product,
				variant,
				extras: chosen,
				lostExtras: wanted.length - chosen.length,
				brief: line.brief,
				qty: line.qty,
			};
		})
		.filter((line): line is NonNullable<typeof line> => line !== null);

	// Two saved lines can land on the same thing once a dropped extra is taken
	// off one of them — a cake with candles the owner has since deleted is now
	// just a cake, and the basket may already hold one of those.
	//
	// They are merged rather than listed twice, because `place_order` groups the
	// items it is handed the same way and prices the total quantity as one line.
	// Left unmerged, a bundle price would apply there and not here, and the
	// number shown would be the one number it must never be: different from the
	// one charged.
	//
	// The brief is part of the key, so two cakes described differently never
	// merge however alike the rest of the line looks. `place_order` groups by it
	// too, which is what keeps the two counts the same.
	type Merged = Omit<(typeof resolved)[number], "source"> & {
		key: string;
		sources: BasketSource[];
	};
	const merged = new Map<string, Merged>();

	for (const { source, ...entry } of resolved) {
		const key = cartLineKey(
			entry.product.id,
			entry.variant?.id,
			entry.extras.map(({ extra, qty }) => ({ id: extra.id, qty })),
			entry.brief,
		);
		const found = merged.get(key);

		if (found) {
			found.qty += entry.qty;
			found.lostExtras += entry.lostExtras;
			found.sources.push(source);
		} else {
			merged.set(key, { ...entry, key, sources: [source] });
		}
	}

	const all = [...merged.values()];

	// Priced a product at a time rather than a line at a time, because the rule
	// that needs it is a rule about the order: three boxes of minis is $50
	// whether that is three of one flavour or one each of three, and a line
	// priced on its own would start the allowance over and charge $52.50.
	// `place_order` groups and allocates exactly the same way, which is what
	// keeps the figure here and the figure charged the same figure.
	//
	// Products with no cheaper rate past the minimum come back out of this
	// priced one line at a time, which is what they have always been.
	const priced = new Map<string, PricedQuantity>();
	for (const productId of new Set(all.map((line) => line.product.id))) {
		const forProduct = all.filter((line) => line.product.id === productId);
		const results = priceProductLines(forProduct[0]!.product, forProduct);
		forProduct.forEach((line, index) => priced.set(line.key, results[index]!));
	}

	const lines = all.map((line): BasketLine => {
		const menu = priced.get(line.key)!;
		const extrasCents = extrasTotalCents(line.extras, line.qty);

		return {
			...line,
			// The extras are named under the line with their own totals, so the
			// note goes on explaining the menu price and nothing else.
			note: menu.note,
			onRequest: menu.onRequest,
			extrasCents,
			totalCents: menu.totalCents + extrasCents,
		};
	});

	return {
		lines,
		dropped: saved.length - resolved.length,
		subtotalCents: lines.reduce((total, line) => total + line.totalCents, 0),
		hasUnpriced: lines.some((line) => line.onRequest),
		// Truthiness rather than `!== undefined`: `parse` in lib/cart.ts lets a
		// stored brief of null through, whatever the type says.
		mayCostMore: lines.some((line) => Boolean(line.brief && hasCustomFlavour(line.brief))),
	};
}
