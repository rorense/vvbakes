import { describe, expect, it } from "vitest";
import {
	defaultVariant,
	findVariant,
	formatPrice,
	isOrderable,
	isValidQty,
	minOrderQty,
	priceForQty,
	priceProduct,
	priceRule,
} from "./pricing";
import type { PriceTier, Product, ProductVariant } from "./types";

function product(overrides: Partial<Product> = {}): Product {
	return {
		id: "00000000-0000-0000-0000-000000000001",
		slug: "cupcakes",
		name: "Cupcakes",
		description: null,
		categoryId: null,
		unitPriceCents: 300,
		unitLabel: "each",
		qtyStep: 1,
		minPerOrder: null,
		tiers: [],
		variantLabel: "Flavour",
		variants: [],
		imagePath: null,
		imageAlt: null,
		isAvailable: true,
		isFeatured: false,
		availabilityNote: null,
		allergens: [],
		sortOrder: 1,
		...overrides,
	};
}

const FOUR_FOR_TWELVE: PriceTier[] = [{ qty: 4, priceCents: 1200 }];

describe("priceForQty", () => {
	it("charges the unit price for a single item", () => {
		expect(priceForQty(300, [], 1)).toEqual({
			totalCents: 300,
			note: "1 x $3.00 each",
		});
	});

	it("uses a bundle when the quantity fills one exactly", () => {
		expect(priceForQty(300, FOUR_FOR_TWELVE, 4)).toEqual({
			totalCents: 1200,
			note: "1 x 4 for $12.00",
		});
	});

	it("mixes bundles and singles", () => {
		expect(priceForQty(300, FOUR_FOR_TWELVE, 5)).toEqual({
			totalCents: 1500,
			note: "1 x 4 for $12.00 + 1 x $3.00 each",
		});
		expect(priceForQty(300, FOUR_FOR_TWELVE, 9)).toEqual({
			totalCents: 2700,
			note: "2 x 4 for $12.00 + 1 x $3.00 each",
		});
	});

	it("picks the cheapest combination rather than the biggest bundle", () => {
		// Greedy would take one 4-pack plus two singles: $12 + $6 = $18.
		const tiers: PriceTier[] = [
			{ qty: 4, priceCents: 1200 },
			{ qty: 3, priceCents: 800 },
		];
		expect(priceForQty(300, tiers, 6)).toEqual({
			totalCents: 1600,
			note: "2 x 3 for $8.00",
		});
	});

	it("respects a bundle that is genuinely cheaper per unit", () => {
		const tiers: PriceTier[] = [{ qty: 6, priceCents: 1500 }];
		expect(priceForQty(300, tiers, 6).totalCents).toBe(1500);
		expect(priceForQty(300, tiers, 12).totalCents).toBe(3000);
		expect(priceForQty(300, tiers, 13).totalCents).toBe(3300);
	});

	it("uses the product's unit label in the note", () => {
		expect(priceForQty(500, [], 2, "slice").note).toBe("2 x $5.00 slice");
	});

	it("rejects a quantity that is not a positive integer", () => {
		expect(() => priceForQty(300, [], 0)).toThrow(RangeError);
		expect(() => priceForQty(300, [], -1)).toThrow(RangeError);
		expect(() => priceForQty(300, [], 1.5)).toThrow(RangeError);
	});

	it("handles a free item without dividing by zero or looping forever", () => {
		expect(priceForQty(0, [], 3)).toEqual({
			totalCents: 0,
			note: "3 x $0.00 each",
		});
	});
});

describe("priceRule", () => {
	it("reads as the menu does for a plain per-unit item", () => {
		expect(priceRule(product({ unitPriceCents: 500, unitLabel: "slice" }))).toBe("$5 / slice");
	});

	it("lists bundles after the unit price", () => {
		expect(priceRule(product({ tiers: FOUR_FOR_TWELVE }))).toBe("$3 each · 4 for $12");
	});

	it("leaves the bundles out when asked for the headline price alone", () => {
		expect(priceRule(product({ tiers: FOUR_FOR_TWELVE }), { bundles: false })).toBe("$3 each");
	});

	it("advertises a stepped item by its step, not its unit price", () => {
		// An item priced $2.50 but only sold in pairs has no single-unit price
		// worth printing: "2 for $5" is the honest headline.
		expect(priceRule(product({ unitPriceCents: 250, qtyStep: 2 }))).toBe("2 for $5");
	});

	it("keeps cents when a price is not a whole number of dollars", () => {
		expect(formatPrice(250)).toBe("$2.50");
		expect(formatPrice(300)).toBe("$3");
	});
});

describe("minOrderQty", () => {
	it("is one step when the product has no minimum", () => {
		expect(minOrderQty(product())).toBe(1);
		expect(minOrderQty(product({ qtyStep: 2 }))).toBe(2);
	});

	it("is the product's minimum when it has one", () => {
		expect(minOrderQty(product({ minPerOrder: 6 }))).toBe(6);
		expect(minOrderQty(product({ qtyStep: 2, minPerOrder: 6 }))).toBe(6);
	});

	it("rounds a minimum up to a whole step", () => {
		// The database refuses to store this, but a rounded answer is still
		// better than offering a quantity nothing will accept.
		expect(minOrderQty(product({ qtyStep: 4, minPerOrder: 6 }))).toBe(8);
	});
});

describe("isValidQty", () => {
	it("accepts multiples of the step and rejects everything else", () => {
		const p = product({ qtyStep: 2 });
		expect(isValidQty(p, 2)).toBe(true);
		expect(isValidQty(p, 4)).toBe(true);
		expect(isValidQty(p, 3)).toBe(false);
		expect(isValidQty(p, 0)).toBe(false);
		expect(isValidQty(p, -2)).toBe(false);
		expect(isValidQty(p, 2.5)).toBe(false);
	});

	it("leaves the per-order minimum to the basket, not the line", () => {
		// Three chocolate and three vanilla is six cupcakes and a valid order.
		// Judging each line against the minimum on its own would throw both of
		// them away. See minOrderQty.
		const p = product({ minPerOrder: 6 });
		expect(isValidQty(p, 3)).toBe(true);
		expect(isValidQty(p, 6)).toBe(true);
	});
});

function variant(
	overrides: Partial<ProductVariant> & Pick<ProductVariant, "name">,
): ProductVariant {
	return {
		id: `variant-${overrides.name.toLowerCase()}`,
		unitPriceCents: 4500,
		imagePath: null,
		allergens: [],
		isAvailable: true,
		sortOrder: 0,
		...overrides,
	};
}

/** A cake in three flavours at three prices, the shape variants exist for. */
const CAKE_FLAVOURS: ProductVariant[] = [
	variant({ name: "Chocolate", unitPriceCents: 4500, sortOrder: 0 }),
	variant({ name: "Carrot", unitPriceCents: 5000, sortOrder: 1 }),
	variant({ name: "Red velvet", unitPriceCents: 5500, sortOrder: 2 }),
];

describe("variants", () => {
	it("prices a line at the chosen flavour's price, not the product's", () => {
		const p = product({ unitPriceCents: 300, unitLabel: "cake", variants: CAKE_FLAVOURS });
		expect(priceProduct(p, 1, CAKE_FLAVOURS[2]).totalCents).toBe(5500);
	});

	it("falls back to the product's own price when nothing is chosen", () => {
		const p = product({ unitPriceCents: 300, variants: CAKE_FLAVOURS });
		expect(priceProduct(p, 1).totalCents).toBe(300);
	});

	it("applies the product's bundle price to the flavour's own price", () => {
		// The bundle is an outright price for two of one line, so it is a bigger
		// saving on the dearer flavour. Worth pinning down: it is the part of this
		// the admin's price preview exists to show.
		const p = product({
			unitLabel: "cake",
			tiers: [{ qty: 2, priceCents: 8000 }],
			variants: CAKE_FLAVOURS,
		});
		expect(priceProduct(p, 2, CAKE_FLAVOURS[0]).totalCents).toBe(8000);
		expect(priceProduct(p, 2, CAKE_FLAVOURS[2]).totalCents).toBe(8000);
	});

	it("shows one price when every flavour costs the same", () => {
		const p = product({
			unitLabel: "cake",
			variants: [
				variant({ name: "Chocolate", unitPriceCents: 4500 }),
				variant({ name: "Vanilla", unitPriceCents: 4500 }),
			],
		});
		expect(priceRule(p)).toBe("$45 / cake");
	});

	it("shows a range when they do not", () => {
		const p = product({ unitLabel: "cake", variants: CAKE_FLAVOURS });
		expect(priceRule(p)).toBe("$45 – $55 / cake");
	});

	it("quotes a range a customer can actually buy", () => {
		// The dearest flavour is off, so quoting up to $55 would be advertising a
		// price nothing on the page is sold at.
		const p = product({
			unitLabel: "cake",
			variants: [
				...CAKE_FLAVOURS.slice(0, 2),
				variant({ name: "Red velvet", unitPriceCents: 5500, isAvailable: false }),
			],
		});
		expect(priceRule(p)).toBe("$45 – $50 / cake");
	});

	it("finds a flavour by id and shrugs off one that has gone", () => {
		const p = product({ variants: CAKE_FLAVOURS });
		expect(findVariant(p, CAKE_FLAVOURS[1]!.id)?.name).toBe("Carrot");
		expect(findVariant(p, "variant-that-was-deleted")).toBeNull();
		expect(findVariant(p, null)).toBeNull();
		expect(findVariant(p, undefined)).toBeNull();
	});

	it("starts a picker on the first flavour still on sale", () => {
		const p = product({
			variants: [
				variant({ name: "Chocolate", isAvailable: false, sortOrder: 0 }),
				variant({ name: "Carrot", sortOrder: 1 }),
			],
		});
		expect(defaultVariant(p)?.name).toBe("Carrot");
	});

	it("counts a product with every flavour sold out as sold out", () => {
		const allOff = product({
			variants: CAKE_FLAVOURS.map((v) => ({ ...v, isAvailable: false })),
		});
		expect(isOrderable(allOff)).toBe(false);
		expect(defaultVariant(allOff)).toBeNull();

		expect(isOrderable(product({ variants: CAKE_FLAVOURS }))).toBe(true);
		expect(isOrderable(product({ isAvailable: false, variants: CAKE_FLAVOURS }))).toBe(false);
		expect(isOrderable(product())).toBe(true);
	});

	it("leaves a flavoured product's headline as a price, not a step", () => {
		// A stepped product normally advertises "2 for $5" because its single-unit
		// price means nothing. With flavours the per-flavour price is the thing
		// the customer is choosing between, so that is what has to be shown.
		const p = product({ unitPriceCents: 250, qtyStep: 2, variants: CAKE_FLAVOURS });
		expect(priceRule(p)).toBe("$45 – $55 each");
	});
});
