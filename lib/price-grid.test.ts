import { describe, expect, it } from "vitest";
import {
	cellKey,
	deriveVariantSubmission,
	EMPTY_CELL,
	hangCells,
	type CellDraft,
	type GroupDraft,
	type OptionDraft,
	type VariantDraftInput,
} from "./price-grid";
import type { Product } from "./types";

interface Cell {
	id: string;
	price: string;
}

const option = (key: string) => ({ key });
const cell = (id: string, price: string): Cell => ({ id, price });

/** Every combination of the given groups, last group varying fastest. */
function combinationsOf(groups: string[][]) {
	return groups.reduce<{ key: string }[][]>(
		(combinations, keys) =>
			combinations.flatMap((combination) => keys.map((key) => [...combination, option(key)])),
		[[]],
	);
}

const priceOf = (hung: Record<string, Cell>, key: string) => hung[key]?.price;
const idOf = (hung: Record<string, Cell>, key: string) => hung[key]?.id;

describe("cellKey", () => {
	it("names a combination by its options, in group order", () => {
		expect(cellKey([option("a"), option("b")])).toBe("a|b");
	});
});

describe("hangCells", () => {
	it("hands back the same cells when every combination already has one", () => {
		const cells = { a: cell("id-a", "10"), b: cell("id-b", "12") };
		const hung = hangCells(combinationsOf([["a", "b"]]), cells);

		expect(hung).toBe(cells);
	});

	// The case this exists for: one option group becoming two. Every saved price
	// has to reach the combinations that extend it, or the grid comes up blank
	// and the save behind it reads that as "take them all off the shelf".
	it("carries a price onto every combination that extends it", () => {
		const cells = { choc: cell("id-choc", "40"), lemon: cell("id-lemon", "38") };
		const hung = hangCells(
			combinationsOf([
				["choc", "lemon"],
				["small", "large"],
			]),
			cells,
		);

		expect(priceOf(hung, "choc|small")).toBe("40");
		expect(priceOf(hung, "choc|large")).toBe("40");
		expect(priceOf(hung, "lemon|small")).toBe("38");
		expect(priceOf(hung, "lemon|large")).toBe("38");
	});

	// Two rows cannot hold one id. The first to inherit keeps it; the rest are
	// new rows, which is what they are — and what stops an upsert writing one
	// database row twice and losing the other.
	it("gives each saved id to exactly one of the combinations inheriting it", () => {
		const cells = { choc: cell("id-choc", "40"), lemon: cell("id-lemon", "38") };
		const hung = hangCells(
			combinationsOf([
				["choc", "lemon"],
				["small", "large"],
			]),
			cells,
		);

		expect(idOf(hung, "choc|small")).toBe("id-choc");
		expect(idOf(hung, "choc|large")).toBe("");
		expect(idOf(hung, "lemon|small")).toBe("id-lemon");
		expect(idOf(hung, "lemon|large")).toBe("");
	});

	it("collapses a row of combinations back onto one when a group is removed", () => {
		const cells = {
			"choc|small": cell("id-1", "40"),
			"choc|large": cell("id-2", "48"),
			"lemon|small": cell("id-3", "38"),
		};
		const hung = hangCells(combinationsOf([["choc", "lemon"]]), cells);

		expect(priceOf(hung, "choc")).toBe("40");
		expect(idOf(hung, "choc")).toBe("id-1");
		expect(priceOf(hung, "lemon")).toBe("38");
		expect(idOf(hung, "lemon")).toBe("id-3");
	});

	it("leaves a genuinely new combination blank rather than guessing", () => {
		const cells = { "choc|small": cell("id-1", "40") };
		const hung = hangCells(combinationsOf([["choc", "lemon"], ["small"]]), cells);

		expect(priceOf(hung, "choc|small")).toBe("40");
		expect(hung["lemon|small"]).toBeUndefined();
	});

	// Half an overlap is a different row, not this one under a new name.
	it("does not inherit from a cell that only partly overlaps", () => {
		const cells = { "choc|small": cell("id-1", "40") };
		const hung = hangCells(combinationsOf([["lemon"], ["small"], ["round"]]), cells);

		expect(hung["lemon|small|round"]).toBeUndefined();
	});

	// An exact match is the combination's own price. It must be settled before
	// anything inherits, or a resembling combination takes the id off it.
	it("never lets an inheriting combination take an id off an exact match", () => {
		const cells = {
			choc: cell("id-loose", "40"),
			"choc|large": cell("id-exact", "48"),
		};
		const hung = hangCells(combinationsOf([["choc"], ["small", "large"]]), cells);

		expect(idOf(hung, "choc|large")).toBe("id-exact");
		expect(priceOf(hung, "choc|large")).toBe("48");
		expect(idOf(hung, "choc|small")).toBe("id-loose");
	});

	// The form writes to the cells it holds, not to what this returns, so a price
	// for a combination that is off the grid today — an option deleted and not
	// yet put back — has to still be there when it comes back.
	it("never changes the cells it was given", () => {
		const cells = { choc: cell("id-1", "40"), lemon: cell("id-2", "38") };
		const before = JSON.stringify(cells);

		hangCells(combinationsOf([["choc"]]), cells);
		hangCells(
			combinationsOf([
				["choc", "lemon"],
				["small", "large"],
			]),
			cells,
		);

		expect(JSON.stringify(cells)).toBe(before);
	});
});

describe("deriveVariantSubmission", () => {
	const opt = (key: string, name: string): OptionDraft => ({
		key,
		id: "",
		name,
		imagePath: "",
		allergens: [],
		isAvailable: true,
	});
	const priced = (price: string, id = ""): CellDraft => ({ ...EMPTY_CELL, id, price });

	// Two flavours in two sizes: four combinations, keyed by their options.
	const groups: GroupDraft[] = [
		{
			key: "g1",
			id: "",
			name: "Flavour",
			options: [opt("choc", "Chocolate"), opt("lemon", "Lemon")],
		},
		{ key: "g2", id: "", name: "Size", options: [opt("s", "Small"), opt("l", "Large")] },
	];
	const saved = { variants: [{ id: "v-choc-s" }, { id: "v-lemon-l" }] } as Pick<
		Product,
		"variants"
	>;
	const derive = (overrides: Partial<VariantDraftInput>) =>
		deriveVariantSubmission({
			product: saved,
			groups,
			cells: {},
			sellsVariants: true,
			priceOnRequest: false,
			unitPrice: "",
			...overrides,
		});

	it("offers only the priced combinations, and names the saved ones it drops", () => {
		const out = derive({
			cells: { "choc|s": priced("40", "v-choc-s"), "choc|l": priced("55"), "lemon|l": priced("") },
		});

		expect(out.combinations).toHaveLength(4);
		expect(JSON.parse(out.variantsJson)).toMatchObject([
			{ id: "v-choc-s", name: "Chocolate · Small", unitPriceCents: "40", options: [0, 0] },
			{ name: "Chocolate · Large", unitPriceCents: "55", options: [0, 1] },
		]);
		// Lemon · Large lost its price, so the save would delete its row, and says so.
		expect(out.removedVariants.map((variant) => variant.id)).toEqual(["v-lemon-l"]);
		// No price of the product's own typed: the cheapest combination stands in.
		expect(out.submittedUnitPrice).toBe("40");
		expect(out.submittedVariantLabel).toBe("Flavour");
	});

	it("saves as a plain product until something is priced", () => {
		const out = derive({ product: null, unitPrice: "12" });

		expect(JSON.parse(out.optionGroupsJson)).toEqual([]);
		expect(JSON.parse(out.variantsJson)).toEqual([]);
		expect(out.submittedUnitPrice).toBe("12");
	});

	it("offers every combination priced on request, and warns about the ones it creates", () => {
		const out = derive({ priceOnRequest: true, cells: { "choc|s": priced("", "v-choc-s") } });

		expect(
			JSON.parse(out.variantsJson).map((v: { unitPriceCents: string }) => v.unitPriceCents),
		).toEqual(["0", "0", "0", "0"]);
		expect(out.addedVariants).toHaveLength(3);
		expect(out.removedVariants.map((variant) => variant.id)).toEqual(["v-lemon-l"]);
		// Nothing to warn about on a product that had no combinations to begin with.
		expect(derive({ priceOnRequest: true, product: null }).addedVariants).toEqual([]);
	});

	it("submits no groups with the switch off, which removes every saved combination", () => {
		const out = derive({
			sellsVariants: false,
			unitPrice: "9",
			cells: { "choc|s": priced("40", "v-choc-s") },
		});

		expect(out.filledGroups).toEqual([]);
		expect(JSON.parse(out.variantsJson)).toEqual([]);
		expect(out.removedVariants).toHaveLength(2);
		expect(out.submittedUnitPrice).toBe("9");
	});

	it("ignores a group or option left with no name", () => {
		const half: GroupDraft[] = [
			{ ...groups[0]!, options: [...groups[0]!.options, opt("blank", "  ")] },
			{ key: "g3", id: "", name: " ", options: [opt("x", "X")] },
		];
		const out = derive({ groups: half, cells: { choc: priced("30") } });

		expect(out.combinations.map((combination) => cellKey(combination))).toEqual(["choc", "lemon"]);
	});
});
