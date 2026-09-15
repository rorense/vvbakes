/**
 * The browser's half of extras pricing.
 *
 * `place_order` is the authority and is tested against real PostgreSQL in
 * tests/schema.test.ts. What is checked here is that this side agrees with it,
 * because the number on the order form and the number charged have to be the
 * same number — the two rules that have to match are "per unit of the line" and
 * "the same extras in either order are one line".
 *
 * An extra belongs to one product, so there is no shop-wide list to look an id
 * up in: the product it was added to is the list.
 */
import { describe, expect, it } from "vitest";
import { cartLineKey } from "./cart";
import {
	availableExtras,
	extraPriceLabel,
	extrasTotalCents,
	extrasUnitCents,
	findExtras,
	normaliseExtraIds,
} from "./pricing";
import type { Extra } from "./types";

function extra(overrides: Partial<Extra> & Pick<Extra, "id" | "name">): Extra {
	return {
		description: null,
		priceCents: 300,
		isAvailable: true,
		sortOrder: 1,
		...overrides,
	};
}

const candles = extra({ id: "a", name: "Candles", priceCents: 300, sortOrder: 1 });
const giftBox = extra({ id: "b", name: "Gift box", priceCents: 800, sortOrder: 2 });
const card = extra({ id: "c", name: "Card", priceCents: 0, sortOrder: 3 });
const soldOut = extra({ id: "d", name: "Sparklers", priceCents: 500, isAvailable: false });

describe("availableExtras", () => {
	it("offers only what is switched on", () => {
		expect(availableExtras([candles, soldOut, giftBox])).toEqual([candles, giftBox]);
	});
});

describe("normaliseExtraIds", () => {
	it("sorts, so the same two picked either way round are one line", () => {
		expect(normaliseExtraIds(["b", "a"])).toEqual(normaliseExtraIds(["a", "b"]));
	});

	it("drops duplicates, so an id sent twice is charged once", () => {
		expect(normaliseExtraIds(["a", "a", "b"])).toEqual(["a", "b"]);
	});

	it("treats absent as none", () => {
		expect(normaliseExtraIds(undefined)).toEqual([]);
		expect(normaliseExtraIds(null)).toEqual([]);
	});
});

describe("findExtras", () => {
	it("returns them in the owner's order, not the order they were picked in", () => {
		expect(findExtras([candles, giftBox, card], ["c", "a"])).toEqual([candles, card]);
	});

	it("skips an id the owner has since deleted rather than throwing", () => {
		// The cart is localStorage and outlives the list it was filled from.
		expect(findExtras([candles], ["a", "gone"])).toEqual([candles]);
	});

	it("skips an id that belongs to a different product", () => {
		// Each product's extras are looked up in its own list, so another
		// product's id names nothing here. `place_order` says the same, by
		// requiring the extra's product_id to match the line's.
		const otherProductsRibbon = extra({ id: "z", name: "Ribbon", priceCents: 100 });
		expect(findExtras([candles, giftBox], [otherProductsRibbon.id])).toEqual([]);
	});
});

describe("extrasTotalCents", () => {
	it("charges once per unit of the line", () => {
		// Two cakes with candles is two sets of candles, which is what
		// `place_order` computes as `sum(price_cents) * qty`.
		expect(extrasTotalCents([candles], 2)).toBe(600);
		expect(extrasTotalCents([candles, giftBox], 3)).toBe(3300);
	});

	it("is not touched by bundle pricing", () => {
		// A bundle is the owner's price for several of one product. She has never
		// been asked what four sets of candles cost, so they stay linear.
		expect(extrasTotalCents([candles], 4)).toBe(1200);
	});

	it("counts a free extra as nothing rather than dropping it", () => {
		expect(extrasUnitCents([card])).toBe(0);
		expect(extrasTotalCents([card, candles], 2)).toBe(600);
	});

	it("is zero when nothing was added", () => {
		expect(extrasTotalCents([], 5)).toBe(0);
	});
});

describe("extraPriceLabel", () => {
	it("says free rather than $0", () => {
		expect(extraPriceLabel(card)).toBe("Free");
	});

	it("only says each when there is more than one to be each of", () => {
		expect(extraPriceLabel(candles, { perUnit: true })).toBe("+$3 each");
		expect(extraPriceLabel(candles, { perUnit: false })).toBe("+$3");
	});
});

describe("cartLineKey", () => {
	it("keeps the same cake with and without extras apart", () => {
		expect(cartLineKey("cake", null, ["a"])).not.toBe(cartLineKey("cake", null, []));
	});

	it("lands on one line however the extras were picked", () => {
		expect(cartLineKey("cake", "v1", ["b", "a"])).toBe(cartLineKey("cake", "v1", ["a", "b"]));
	});

	it("leaves a line with no variant and no extras as the one it always was", () => {
		// Absent, null and empty are all "none", so a cart saved before either
		// feature existed goes on matching the line it names.
		expect(cartLineKey("cake")).toBe(cartLineKey("cake", null, []));
	});
});
