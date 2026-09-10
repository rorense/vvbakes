import { describe, expect, it } from "vitest";
import { formatPrice, isValidQty, priceForQty, priceRule, stepQty } from "./pricing";
import type { PriceTier, Product } from "./types";

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
		maxPerOrder: null,
		tiers: [],
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

	it("advertises a stepped item by its step, not its unit price", () => {
		// Cookies are $2.50 each but only sold in pairs, so "2 for $5" is the
		// honest headline and "$2.50 each" would be misleading.
		expect(priceRule(product({ name: "Cookies", unitPriceCents: 250, qtyStep: 2 }))).toBe(
			"2 for $5",
		);
	});

	it("keeps cents when a price is not a whole number of dollars", () => {
		expect(formatPrice(250)).toBe("$2.50");
		expect(formatPrice(300)).toBe("$3");
	});
});

describe("stepQty", () => {
	it("steps by one for a normal product", () => {
		const p = product();
		expect(stepQty(p, 1, 1)).toBe(2);
		expect(stepQty(p, 2, -1)).toBe(1);
	});

	it("steps by the product's step size", () => {
		const p = product({ qtyStep: 2 });
		expect(stepQty(p, 2, 1)).toBe(4);
		expect(stepQty(p, 4, -1)).toBe(2);
	});

	it("returns zero when stepping below the minimum, which removes the line", () => {
		expect(stepQty(product(), 1, -1)).toBe(0);
		expect(stepQty(product({ qtyStep: 2 }), 2, -1)).toBe(0);
	});

	it("refuses to step past the per-order maximum", () => {
		const p = product({ maxPerOrder: 6 });
		expect(stepQty(p, 6, 1)).toBe(6);
		expect(stepQty(p, 5, 1)).toBe(6);
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

	it("enforces the per-order maximum", () => {
		const p = product({ maxPerOrder: 4 });
		expect(isValidQty(p, 4)).toBe(true);
		expect(isValidQty(p, 5)).toBe(false);
	});
});
