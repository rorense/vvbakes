/**
 * The browser's half of extras pricing.
 *
 * `place_order` is the authority and is tested against real PostgreSQL in
 * tests/schema.test.ts. What is checked here is that this side agrees with it,
 * because the number on the order form and the number charged have to be the
 * same number — the three rules that have to match are "per unit of the line",
 * "times how many of the extra", and "the same extras in either order are one
 * line".
 *
 * An extra belongs to one product, so there is no shop-wide list to look an id
 * up in: the product it was added to is the list.
 */
import { describe, expect, it } from "vitest";
import { cartLineKey } from "./cart";
import {
	availableExtras,
	clampExtraQty,
	extraLabel,
	extraPriceLabel,
	extrasFromIds,
	extrasTotalCents,
	extrasUnitCents,
	findExtras,
	normaliseExtras,
} from "./pricing";
import type { Extra } from "./types";

function extra(overrides: Partial<Extra> & Pick<Extra, "id" | "name">): Extra {
	return {
		description: null,
		priceCents: 300,
		maxQty: 1,
		isAvailable: true,
		sortOrder: 1,
		...overrides,
	};
}

const candles = extra({ id: "a", name: "Candles", priceCents: 300, maxQty: 24, sortOrder: 1 });
const giftBox = extra({ id: "b", name: "Gift box", priceCents: 800, sortOrder: 2 });
const card = extra({ id: "c", name: "Card", priceCents: 0, sortOrder: 3 });
const soldOut = extra({ id: "d", name: "Sparklers", priceCents: 500, isAvailable: false });

/** One of each, the way a basket saved before quantities existed reads. */
function one(...ids: string[]) {
	return extrasFromIds(ids);
}

describe("availableExtras", () => {
	it("offers only what is switched on", () => {
		expect(availableExtras([candles, soldOut, giftBox])).toEqual([candles, giftBox]);
	});
});

describe("normaliseExtras", () => {
	it("sorts, so the same two picked either way round are one line", () => {
		expect(normaliseExtras(one("b", "a"))).toEqual(normaliseExtras(one("a", "b")));
	});

	it("keeps the larger count when an id is sent twice", () => {
		// `place_order` takes the max the same way. Someone who asked for six and
		// then for one asked for six, and either way it is charged once.
		expect(
			normaliseExtras([
				{ id: "a", qty: 1 },
				{ id: "a", qty: 6 },
			]),
		).toEqual([{ id: "a", qty: 6 }]);
	});

	it("treats absent as none", () => {
		expect(normaliseExtras(undefined)).toEqual([]);
		expect(normaliseExtras(null)).toEqual([]);
	});

	it("reads a count below one, or no count at all, as one", () => {
		// A hand-edited basket, or one saved by a browser that dropped the field.
		expect(normaliseExtras([{ id: "a", qty: 0 }])).toEqual([{ id: "a", qty: 1 }]);
		expect(normaliseExtras([{ id: "a", qty: 2.5 }])).toEqual([{ id: "a", qty: 1 }]);
	});
});

describe("findExtras", () => {
	it("returns them in the owner's order, not the order they were picked in", () => {
		expect(findExtras([candles, giftBox, card], one("c", "a"))).toEqual([
			{ extra: candles, qty: 1 },
			{ extra: card, qty: 1 },
		]);
	});

	it("carries the count that was asked for", () => {
		expect(findExtras([candles], [{ id: "a", qty: 6 }])).toEqual([{ extra: candles, qty: 6 }]);
	});

	it("cuts a count down to what the product now allows rather than dropping it", () => {
		// The cap is hers to lower after a basket was filled. Six candles instead
		// of forty is much closer to what was asked for than no candles — and than
		// a basket `place_order` would refuse outright.
		const six = extra({ id: "a", name: "Candles", maxQty: 6 });
		expect(findExtras([six], [{ id: "a", qty: 40 }])).toEqual([{ extra: six, qty: 6 }]);
	});

	it("skips an id the owner has since deleted rather than throwing", () => {
		// The cart is localStorage and outlives the list it was filled from.
		expect(findExtras([candles], one("a", "gone"))).toEqual([{ extra: candles, qty: 1 }]);
	});

	it("skips an id that belongs to a different product", () => {
		// Each product's extras are looked up in its own list, so another
		// product's id names nothing here. `place_order` says the same, by
		// requiring the extra's product_id to match the line's.
		const otherProductsRibbon = extra({ id: "z", name: "Ribbon", priceCents: 100 });
		expect(findExtras([candles, giftBox], one(otherProductsRibbon.id))).toEqual([]);
	});
});

describe("clampExtraQty", () => {
	it("holds a count inside what the product allows", () => {
		expect(clampExtraQty(candles, 6)).toBe(6);
		expect(clampExtraQty(candles, 99)).toBe(24);
		expect(clampExtraQty(candles, 0)).toBe(1);
	});

	it("leaves a tick-box extra at one whatever it is handed", () => {
		expect(clampExtraQty(giftBox, 5)).toBe(1);
	});
});

describe("extrasTotalCents", () => {
	it("charges once per unit of the line", () => {
		// Two cakes with candles is two sets of candles, which is what
		// `place_order` computes as `sum(price_cents * qty) * line qty`.
		expect(extrasTotalCents(findExtras([candles], one("a")), 2)).toBe(600);
		expect(extrasTotalCents(findExtras([candles, giftBox], one("a", "b")), 3)).toBe(3300);
	});

	it("multiplies by how many of the extra were asked for", () => {
		// Six candles on each of two cupcakes: 300c x 6 x 2.
		expect(extrasUnitCents([{ extra: candles, qty: 6 }])).toBe(1800);
		expect(extrasTotalCents([{ extra: candles, qty: 6 }], 2)).toBe(3600);
	});

	it("is not touched by bundle pricing", () => {
		// A bundle is the owner's price for several of one product. She has never
		// been asked what four sets of candles cost, so they stay linear.
		expect(extrasTotalCents(findExtras([candles], one("a")), 4)).toBe(1200);
	});

	it("counts a free extra as nothing rather than dropping it", () => {
		expect(extrasUnitCents(findExtras([card], one("c")))).toBe(0);
		expect(extrasTotalCents(findExtras([card, candles], one("a", "c")), 2)).toBe(600);
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

	it("stays the price of one, however many were picked", () => {
		// The count is shown beside the picker. Multiplying it in here as well
		// would say the same thing twice and disagree the moment it changed.
		expect(extraPriceLabel(candles)).toBe("+$3 each");
	});
});

describe("extraLabel", () => {
	it("writes the count in only when there is more than one", () => {
		expect(extraLabel("Candles", 6)).toBe("Candles × 6");
		expect(extraLabel("Gift box", 1)).toBe("Gift box");
	});
});

describe("cartLineKey", () => {
	it("keeps the same cake with and without extras apart", () => {
		expect(cartLineKey("cake", null, one("a"))).not.toBe(cartLineKey("cake", null, []));
	});

	it("keeps six candles and one candle apart", () => {
		// They cost different amounts and the customer asked for one of each, the
		// same way the cake with candles and the cake without are two lines.
		expect(cartLineKey("cake", null, [{ id: "a", qty: 6 }])).not.toBe(
			cartLineKey("cake", null, [{ id: "a", qty: 1 }]),
		);
	});

	it("lands on one line however the extras were picked", () => {
		expect(cartLineKey("cake", "v1", one("b", "a"))).toBe(cartLineKey("cake", "v1", one("a", "b")));
	});

	it("leaves a line with no variant and no extras as the one it always was", () => {
		// Absent, null and empty are all "none", so a cart saved before either
		// feature existed goes on matching the line it names.
		expect(cartLineKey("cake")).toBe(cartLineKey("cake", null, []));
	});

	it("matches a line saved before quantities existed with the same line saved now", () => {
		// A bare id means one of that extra, so a basket filled last week is the
		// same line as the same basket filled today.
		expect(cartLineKey("cake", null, one("a"))).toBe(
			cartLineKey("cake", null, [{ id: "a", qty: 1 }]),
		);
	});
});
