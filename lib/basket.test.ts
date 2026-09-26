/**
 * What the basket comes to, as the order form and the phone's bar both read it.
 *
 * The rules themselves are tested where they live: bundles and the rate past a
 * minimum in lib/pricing.test.ts, the extras in lib/extras.test.ts, and all of
 * it against `place_order` in tests/pricing-parity.test.ts. What is checked
 * here is the part in between, which used to be written into the order form:
 * which saved lines survive, which of them become one line, and that the lines
 * of one product are priced together rather than one at a time.
 */
import { describe, expect, it } from "vitest";
import { priceBasket } from "./basket";
import type { CartLine, Extra, Product, ProductVariant } from "./types";

function product(overrides: Partial<Product> & Pick<Product, "id">): Product {
	return {
		slug: overrides.id,
		name: overrides.id,
		description: null,
		categoryId: null,
		unitPriceCents: 300,
		unitLabel: "each",
		qtyStep: 1,
		minPerOrder: null,
		extraUnitPriceCents: null,
		tiers: [],
		priceGuide: [],
		priceGuideNote: null,
		variantLabel: "Flavour",
		variants: [],
		optionGroups: [],
		extras: [],
		imagePath: null,
		imageAlt: null,
		galleryImagePaths: [],
		isAvailable: true,
		isFeatured: false,
		availabilityNote: null,
		allergens: [],
		sortOrder: 1,
		priceOnRequest: false,
		wantsBrief: false,
		wantsCustomFlavour: false,
		mixVariants: false,
		wantsNote: true,
		noteHint: null,
		notePlaceholder: null,
		inspirationHint: null,
		briefNoun: null,
		...overrides,
	};
}

function variant(overrides: Partial<ProductVariant> & Pick<ProductVariant, "id">): ProductVariant {
	return {
		name: overrides.id,
		unitPriceCents: 1750,
		imagePath: null,
		allergens: [],
		isAvailable: true,
		sortOrder: 1,
		minPerOrder: null,
		optionIds: [],
		...overrides,
	};
}

function extra(overrides: Partial<Extra> & Pick<Extra, "id">): Extra {
	return {
		name: overrides.id,
		description: null,
		priceCents: 300,
		maxQty: 1,
		isAvailable: true,
		sortOrder: 1,
		...overrides,
	};
}

const candles = extra({ id: "candles", priceCents: 50, maxQty: 24 });
const giftBox = extra({ id: "gift-box", priceCents: 800, isAvailable: false });

// "4 for $10", so two lines of two cost $12 apart and $10 together.
const cupcakes = product({
	id: "cupcakes",
	tiers: [{ qty: 4, priceCents: 1000 }],
	extras: [candles, giftBox],
});

// The minis: two boxes is the smallest order, and every box past it is cheaper.
const minis = product({
	id: "minis",
	unitPriceCents: 1750,
	unitLabel: "box of 12",
	minPerOrder: 2,
	extraUnitPriceCents: 1500,
	variants: [
		variant({ id: "vanilla", sortOrder: 1 }),
		variant({ id: "chocolate", sortOrder: 2 }),
		variant({ id: "pandan", sortOrder: 3 }),
		variant({ id: "ube", sortOrder: 4, isAvailable: false }),
	],
});

const cookies = product({ id: "cookies", unitPriceCents: 250, qtyStep: 2 });

const cake = product({
	id: "cake",
	unitPriceCents: 0,
	unitLabel: "cake",
	priceOnRequest: true,
	extras: [candles],
});

const soldOut = product({ id: "sold-out", isAvailable: false });

const catalogue = new Map(
	[cupcakes, minis, cookies, cake, soldOut].map((entry) => [entry.id, entry]),
);

describe("priceBasket", () => {
	it("prices an empty basket as nothing at all", () => {
		expect(priceBasket([], catalogue)).toEqual({
			lines: [],
			dropped: 0,
			subtotalCents: 0,
			hasUnpriced: false,
			mayCostMore: false,
		});
	});

	it("prices a line the way the menu does", () => {
		const basket = priceBasket([{ productId: "cupcakes", qty: 5 }], catalogue);

		expect(basket.lines).toHaveLength(1);
		expect(basket.lines[0]).toMatchObject({
			qty: 5,
			note: "1 x 4 for $10.00 + 1 x $3.00 each",
			onRequest: false,
			totalCents: 1300,
		});
		expect(basket.subtotalCents).toBe(1300);
	});

	it("adds up every line, in the order the basket holds them", () => {
		const basket = priceBasket(
			[
				{ productId: "cookies", qty: 4 },
				{ productId: "cupcakes", qty: 4 },
			],
			catalogue,
		);

		expect(basket.lines.map((line) => line.product.id)).toEqual(["cookies", "cupcakes"]);
		expect(basket.subtotalCents).toBe(1000 + 1000);
	});

	it("prices one product's flavours together, so the cheaper boxes start where the order passes the minimum", () => {
		const basket = priceBasket(
			[
				{ productId: "minis", variantId: "vanilla", qty: 1 },
				{ productId: "minis", variantId: "chocolate", qty: 1 },
				{ productId: "minis", variantId: "pandan", qty: 1 },
			],
			catalogue,
		);

		// $17.50 + $17.50 + $15, not three first boxes at $52.50.
		expect(basket.subtotalCents).toBe(5000);
		expect(basket.lines.map((line) => line.totalCents).sort((a, b) => a - b)).toEqual([
			1500, 1750, 1750,
		]);
	});

	it("merges saved lines that come to the same thing once a gone extra is taken off", () => {
		const saved: CartLine[] = [
			{ productId: "cupcakes", qty: 2, extras: [{ id: "gift-box", qty: 1 }] },
			{ productId: "cupcakes", qty: 2 },
		];
		const basket = priceBasket(saved, catalogue);

		expect(basket.lines).toHaveLength(1);
		// Priced as four, which is a bundle, rather than as two twos, which are not.
		expect(basket.lines[0]).toMatchObject({ qty: 4, lostExtras: 1, totalCents: 1000 });
		// Both saved lines, as saved, so the form can still find them to change.
		expect(basket.lines[0]!.sources).toEqual([
			{ variantId: null, extras: [{ id: "gift-box", qty: 1 }], brief: undefined },
			{ variantId: null, extras: [], brief: undefined },
		]);
		expect(basket.dropped).toBe(0);
	});

	it("never merges two lines described differently", () => {
		const basket = priceBasket(
			[
				{ productId: "cupcakes", qty: 2, brief: { note: "Blue, please" } },
				{ productId: "cupcakes", qty: 2, brief: { note: "Pink, please" } },
			],
			catalogue,
		);

		expect(basket.lines).toHaveLength(2);
		expect(basket.subtotalCents).toBe(600 + 600);
	});

	it("drops whatever can no longer be bought, and counts it", () => {
		const basket = priceBasket(
			[
				{ productId: "cupcakes", qty: 1 },
				// Deleted from the shop altogether.
				{ productId: "gone", qty: 1 },
				// Switched off.
				{ productId: "sold-out", qty: 1 },
				// A flavour that has sold out.
				{ productId: "minis", variantId: "ube", qty: 2 },
				// A flavour the owner has since deleted.
				{ productId: "minis", variantId: "lemon", qty: 2 },
				// A flavoured product saved without one.
				{ productId: "minis", qty: 2 },
				// A plain product saved with a flavour it no longer has.
				{ productId: "cupcakes", variantId: "vanilla", qty: 1 },
				// Not a whole number of pairs.
				{ productId: "cookies", qty: 3 },
			],
			catalogue,
		);

		expect(basket.lines.map((line) => line.product.id)).toEqual(["cupcakes"]);
		expect(basket.dropped).toBe(7);
		expect(basket.subtotalCents).toBe(300);
	});

	it("takes an extra off rather than the line it was on", () => {
		const basket = priceBasket(
			[
				{
					productId: "cupcakes",
					qty: 2,
					extras: [
						{ id: "candles", qty: 6 },
						{ id: "gift-box", qty: 1 },
					],
				},
			],
			catalogue,
		);

		expect(basket.lines).toHaveLength(1);
		expect(basket.lines[0]!.extras.map(({ extra: kept }) => kept.id)).toEqual(["candles"]);
		expect(basket.lines[0]).toMatchObject({
			lostExtras: 1,
			// Six candles on each of two cupcakes at 50c.
			extrasCents: 600,
			totalCents: 600 + 600,
		});
		expect(basket.dropped).toBe(0);
	});

	it("reads a basket saved before extras had counts", () => {
		const basket = priceBasket(
			[{ productId: "cupcakes", qty: 1, extraIds: ["candles"] }],
			catalogue,
		);

		expect(basket.lines[0]).toMatchObject({ extrasCents: 50, totalCents: 350 });
	});

	it("counts nothing for a cake with no price yet, but says so", () => {
		const basket = priceBasket(
			[
				{ productId: "cupcakes", qty: 4 },
				{ productId: "cake", qty: 1, extras: [{ id: "candles", qty: 2 }] },
			],
			catalogue,
		);

		expect(basket.lines[1]).toMatchObject({
			onRequest: true,
			note: "Price to follow",
			// What its candles come to, and not a cent for the cake itself.
			extrasCents: 100,
			totalCents: 100,
		});
		expect(basket.subtotalCents).toBe(1000 + 100);
		expect(basket.hasUnpriced).toBe(true);
		expect(basket.mayCostMore).toBe(false);
	});

	it("notices a flavour of the customer's own", () => {
		const basket = priceBasket(
			[{ productId: "cupcakes", qty: 4, brief: { customFlavour: "Pandan" } }],
			catalogue,
		);

		expect(basket.mayCostMore).toBe(true);
		expect(basket.hasUnpriced).toBe(false);
	});

	it("does not trip over a brief that was stored as null", () => {
		// `parse` in lib/cart.ts lets this through, whatever the type says.
		const saved = [{ productId: "cupcakes", qty: 1, brief: null }] as unknown as CartLine[];
		const basket = priceBasket(saved, catalogue);

		expect(basket.lines).toHaveLength(1);
		expect(basket.mayCostMore).toBe(false);
	});
});
