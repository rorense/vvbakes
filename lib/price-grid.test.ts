import { describe, expect, it } from "vitest";
import { cellKey, hangCells } from "./price-grid";

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
