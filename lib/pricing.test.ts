import { describe, expect, it } from "vitest";
import {
	defaultSelection,
	defaultVariant,
	findVariant,
	formatPrice,
	isOrderable,
	isOptionSelectable,
	isValidQty,
	isVariantAvailable,
	minOrderQty,
	optionGroups,
	priceForQty,
	priceProduct,
	priceRule,
	selectionFor,
	variantFor,
	variantOptionIds,
	variantOptions,
} from "./pricing";
import type {
	PriceTier,
	Product,
	ProductOption,
	ProductOptionGroup,
	ProductVariant,
} from "./types";

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
		isAvailable: true,
		isFeatured: false,
		availabilityNote: null,
		allergens: [],
		sortOrder: 1,
		priceOnRequest: false,
		wantsBrief: false,
		wantsCustomFlavour: false,
		wantsNote: true,
		noteHint: null,
		notePlaceholder: null,
		inspirationHint: null,
		...overrides,
	};
}

const FOUR_FOR_TWELVE: PriceTier[] = [{ qty: 4, priceCents: 1200 }];

describe("priceForQty", () => {
	it("charges the unit price for a single item", () => {
		expect(priceForQty(300, [], 1)).toEqual({
			totalCents: 300,
			note: "1 x $3.00 each",
			onRequest: false,
		});
	});

	it("uses a bundle when the quantity fills one exactly", () => {
		expect(priceForQty(300, FOUR_FOR_TWELVE, 4)).toEqual({
			totalCents: 1200,
			note: "1 x 4 for $12.00",
			onRequest: false,
		});
	});

	it("mixes bundles and singles", () => {
		expect(priceForQty(300, FOUR_FOR_TWELVE, 5)).toEqual({
			totalCents: 1500,
			note: "1 x 4 for $12.00 + 1 x $3.00 each",
			onRequest: false,
		});
		expect(priceForQty(300, FOUR_FOR_TWELVE, 9)).toEqual({
			totalCents: 2700,
			note: "2 x 4 for $12.00 + 1 x $3.00 each",
			onRequest: false,
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
			onRequest: false,
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
			onRequest: false,
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

/**
 * The mini cupcakes, in the numbers she gave: $17.50 a box of twelve for the
 * first two, two boxes the smallest order, $15 a box after that.
 */
const MINIS = { unitPriceCents: 1750, minPerOrder: 2, extraUnitPriceCents: 1500 } as const;

describe("a price after the minimum", () => {
	it("charges the unit price up to the minimum and the lower one after", () => {
		const p = product({ ...MINIS, unitLabel: "box of 12" });

		expect(priceProduct(p, 2).totalCents).toBe(3500);
		expect(priceProduct(p, 3).totalCents).toBe(5000);
		expect(priceProduct(p, 4).totalCents).toBe(6500);
		expect(priceProduct(p, 5).totalCents).toBe(8000);
		expect(priceProduct(p, 6).totalCents).toBe(9500);
	});

	it("keeps going past the last rung the old bundle list had", () => {
		// The whole point: the tier table stopped at six boxes and somebody
		// eventually wants twelve.
		const p = product(MINIS);
		expect(priceProduct(p, 12).totalCents).toBe(3500 + 1500 * 10);
		expect(priceProduct(p, 40).totalCents).toBe(3500 + 1500 * 38);
	});

	it("charges the unit price for a line that has not reached the minimum", () => {
		// What one line of a split basket is. Two boxes in two flavours is two of
		// these, so twenty-four minis comes to the same $35 either way, which is
		// the promise the minimum makes by counting across the flavours.
		const p = product(MINIS);
		expect(priceProduct(p, 1).totalCents).toBe(1750);
		expect(priceProduct(p, 1).totalCents * 2).toBe(priceProduct(p, 2).totalCents);
	});

	it("names the first few as one price and the rest as singles", () => {
		const p = product({ ...MINIS, unitLabel: "box of 12" });

		expect(priceProduct(p, 1).note).toBe("1 x $17.50 box of 12");
		expect(priceProduct(p, 2).note).toBe("1 x 2 for $35.00");
		expect(priceProduct(p, 4).note).toBe("1 x 2 for $35.00 + 2 x $15.00 box of 12");
	});

	it("counts from the step size when the product has no minimum", () => {
		// `minOrderQty` is the threshold, not `minPerOrder` itself, so this is
		// "the first one at full price" rather than a crash or a free box.
		const p = product({ unitPriceCents: 1750, extraUnitPriceCents: 1500 });
		expect(priceProduct(p, 1).totalCents).toBe(1750);
		expect(priceProduct(p, 3).totalCents).toBe(1750 + 1500 * 2);
	});

	it("applies the product's rate to a flavour priced away from it", () => {
		// The lower rate belongs to the product, the way a bundle does. Only the
		// first few follow the flavour's own price.
		const p = product({
			...MINIS,
			variants: [variant({ name: "Red velvet", unitPriceCents: 2000 })],
		});
		expect(priceProduct(p, 3, p.variants[0]!).totalCents).toBe(2000 * 2 + 1500);
	});

	it("says so on the menu line instead of listing every quantity", () => {
		expect(priceRule(product({ ...MINIS, unitLabel: "box of 12" }))).toBe(
			"$17.50 / box of 12 · $15 each after 2",
		);
		// The card has room for one price only, and it is still the first one.
		expect(priceRule(product({ ...MINIS, unitLabel: "box of 12" }), { bundles: false })).toBe(
			"$17.50 / box of 12",
		);
	});

	it("leaves a product without one priced exactly as before", () => {
		const p = product({ tiers: FOUR_FOR_TWELVE });
		expect(priceProduct(p, 5)).toEqual(priceForQty(300, FOUR_FOR_TWELVE, 5));
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
		optionIds: [],
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

function option(
	overrides: Partial<ProductOption> & Pick<ProductOption, "id" | "name">,
): ProductOption {
	return {
		imagePath: null,
		allergens: [],
		isAvailable: true,
		sortOrder: 0,
		...overrides,
	};
}

/**
 * A cake that asks two questions: three flavours by two layer counts.
 *
 * Deliberately not a full matrix. "Lemon, 3 layers" is missing, because a hole
 * is a thing the owner is allowed to leave and the picker has to cope with.
 */
const FLAVOUR: ProductOptionGroup = {
	id: "group-flavour",
	name: "Flavour",
	sortOrder: 0,
	options: [
		option({ id: "chocolate", name: "Chocolate", sortOrder: 0 }),
		option({ id: "carrot", name: "Carrot", allergens: ["nuts"], sortOrder: 1 }),
		option({ id: "lemon", name: "Lemon", sortOrder: 2 }),
	],
};

const LAYERS: ProductOptionGroup = {
	id: "group-layers",
	name: "Layers",
	sortOrder: 1,
	options: [
		option({ id: "two", name: "2 layers", sortOrder: 0 }),
		option({ id: "three", name: "3 layers", sortOrder: 1 }),
	],
};

const MATRIX: ProductVariant[] = [
	variant({ name: "Chocolate · 2 layers", unitPriceCents: 4500, optionIds: ["chocolate", "two"] }),
	variant({
		name: "Chocolate · 3 layers",
		unitPriceCents: 6500,
		optionIds: ["chocolate", "three"],
	}),
	variant({ name: "Carrot · 2 layers", unitPriceCents: 5000, optionIds: ["carrot", "two"] }),
	variant({ name: "Carrot · 3 layers", unitPriceCents: 7000, optionIds: ["carrot", "three"] }),
	variant({ name: "Lemon · 2 layers", unitPriceCents: 4800, optionIds: ["lemon", "two"] }),
];

function matrixCake(overrides: Partial<Product> = {}): Product {
	return product({
		unitPriceCents: 4500,
		unitLabel: "cake",
		optionGroups: [FLAVOUR, LAYERS],
		variants: MATRIX,
		...overrides,
	});
}

describe("one question, stored as none", () => {
	it("reads a flat list of flavours as a single group named by the label", () => {
		const p = product({ variantLabel: "Flavour", variants: CAKE_FLAVOURS });
		const groups = optionGroups(p);

		expect(groups).toHaveLength(1);
		expect(groups[0]!.name).toBe("Flavour");
		// Empty, because there is no row behind it. That is what the admin form
		// reads to know these answers still have to be created.
		expect(groups[0]!.id).toBe("");
		expect(groups[0]!.options.map((o) => o.name)).toEqual(["Chocolate", "Carrot", "Red velvet"]);
	});

	it("makes each flavour its own answer, so the two resolve back to each other", () => {
		const p = product({ variants: CAKE_FLAVOURS });

		for (const flavour of CAKE_FLAVOURS) {
			expect(variantOptionIds(p, flavour)).toEqual([flavour.id]);
			expect(variantFor(p, selectionFor(p, flavour))).toBe(flavour);
		}
	});

	it("has nothing to say about a product sold as one thing", () => {
		expect(optionGroups(product())).toEqual([]);
		expect(defaultSelection(product())).toEqual({});
		expect(variantFor(product(), {})).toBeNull();
	});

	it("leaves availability exactly where it was", () => {
		const soldOut = variant({ name: "Chocolate", isAvailable: false });
		const p = product({ variants: [soldOut, ...CAKE_FLAVOURS.slice(1)] });

		expect(isVariantAvailable(p, soldOut)).toBe(false);
		expect(isVariantAvailable(p, CAKE_FLAVOURS[1]!)).toBe(true);
	});
});

describe("two questions", () => {
	it("resolves a pair of answers to the combination they name", () => {
		const p = matrixCake();
		const chosen = variantFor(p, { "group-flavour": "carrot", "group-layers": "three" });

		expect(chosen?.name).toBe("Carrot · 3 layers");
		expect(priceProduct(p, 1, chosen).totalCents).toBe(7000);
	});

	it("resolves nothing for a combination she does not make", () => {
		const p = matrixCake();
		expect(variantFor(p, { "group-flavour": "lemon", "group-layers": "three" })).toBeNull();
	});

	it("resolves nothing until every question is answered", () => {
		const p = matrixCake();
		expect(variantFor(p, { "group-flavour": "carrot" })).toBeNull();
	});

	it("starts the picker on a combination that can actually be bought", () => {
		const p = matrixCake();
		const start = defaultSelection(p);

		expect(variantFor(p, start)?.name).toBe("Chocolate · 2 layers");
	});

	it("takes every combination of an answer down when the answer sells out", () => {
		const p = matrixCake({
			optionGroups: [
				{
					...FLAVOUR,
					options: FLAVOUR.options.map((o) =>
						o.id === "carrot" ? { ...o, isAvailable: false } : o,
					),
				},
				LAYERS,
			],
		});

		const names = availableVariantNames(p);
		expect(names).not.toContain("Carrot · 2 layers");
		expect(names).not.toContain("Carrot · 3 layers");
		expect(names).toContain("Chocolate · 2 layers");
	});

	it("takes down one combination without touching the rest of its flavour", () => {
		const p = matrixCake({
			variants: MATRIX.map((v) =>
				v.name === "Chocolate · 3 layers" ? { ...v, isAvailable: false } : v,
			),
		});

		const names = availableVariantNames(p);
		expect(names).not.toContain("Chocolate · 3 layers");
		expect(names).toContain("Chocolate · 2 layers");
	});

	it("greys out an answer that does not go with what is already picked", () => {
		const p = matrixCake();

		// Lemon and 2 layers is a cake; lemon and 3 layers is not.
		const lemon = { "group-flavour": "lemon", "group-layers": "two" };
		expect(isOptionSelectable(p, lemon, "group-layers", "three")).toBe(false);
		expect(isOptionSelectable(p, lemon, "group-layers", "two")).toBe(true);

		// And picking the flavour is never blocked by the flavour already picked.
		expect(isOptionSelectable(p, lemon, "group-flavour", "chocolate")).toBe(true);
	});

	it("stops offering a combination that has lost one of its answers", () => {
		// She deleted the flavour. The link went with it and left the combination
		// answering one of two questions, which no picker can name.
		const orphan = variant({ name: "Ghost · 2 layers", optionIds: ["two"] });
		const p = matrixCake({ variants: [...MATRIX, orphan] });

		expect(isVariantAvailable(p, orphan)).toBe(false);
		expect(availableVariantNames(p)).not.toContain("Ghost · 2 layers");
		// And it does not drag the advertised range around with it either.
		expect(priceRule(p)).toBe("$45 – $70 / cake");
	});

	it("gathers the answers a combination is made of, in question order", () => {
		const p = matrixCake();
		const carrotThree = variantFor(p, { "group-flavour": "carrot", "group-layers": "three" })!;

		expect(variantOptions(p, carrotThree).map((o) => o.name)).toEqual(["Carrot", "3 layers"]);
	});

	it("quotes the range across every combination on sale", () => {
		expect(priceRule(matrixCake())).toBe("$45 – $70 / cake");
	});
});

/** The names of the combinations a customer could put in a basket right now. */
function availableVariantNames(p: Product): string[] {
	return p.variants.filter((v) => isVariantAvailable(p, v)).map((v) => v.name);
}
