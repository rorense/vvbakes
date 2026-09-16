import { describe, expect, it } from "vitest";
import { refusedRemoval, type HeldVariant } from "./variant-guard";

const HELD: HeldVariant[] = [
	{ id: "id-choc", name: "Chocolate" },
	{ id: "id-carrot", name: "Carrot" },
	{ id: "id-lemon", name: "Lemon" },
];

/** A save that keeps everything, which is nearly every save she makes. */
function keepingEverything() {
	return {
		held: HELD,
		submittedIds: HELD.map((row) => row.id),
		submittedCount: HELD.length,
		removeVariants: false,
		removedVariants: [],
	};
}

describe("refusedRemoval", () => {
	it("lets a save that keeps every combination through", () => {
		expect(refusedRemoval(keepingEverything())).toBeNull();
	});

	it("lets her clear one price, because the form listed it", () => {
		expect(
			refusedRemoval({
				...keepingEverything(),
				submittedIds: ["id-choc", "id-carrot"],
				submittedCount: 2,
				removedVariants: ["id-lemon"],
			}),
		).toBeNull();
	});

	it("names a row the save would drop that the form never listed", () => {
		const message = refusedRemoval({
			...keepingEverything(),
			submittedIds: ["id-choc"],
			submittedCount: 1,
			removedVariants: [],
		});

		expect(message).toContain("Carrot, Lemon");
		expect(message).toContain("Nothing was changed");
	});

	it("says it rather than them when only one row is at stake", () => {
		const message = refusedRemoval({
			...keepingEverything(),
			submittedIds: ["id-choc", "id-carrot"],
			submittedCount: 2,
			removedVariants: [],
		});

		expect(message).toContain("Give it a price");
	});

	// The case the guard exists for. A product gaining a second option group used
	// to re-key every cell in the price grid, so the grid came up blank, the form
	// submitted no combinations at all, and it listed every row the product had
	// in `removedVariants` — which the check above reads as permission. The whole
	// list went off a live catalogue and the save reported success.
	it("refuses an empty grid even when it names every row it is removing", () => {
		const message = refusedRemoval({
			held: HELD,
			submittedIds: [],
			submittedCount: 0,
			removeVariants: false,
			removedVariants: HELD.map((row) => row.id),
		});

		expect(message).toContain("every combination off this product");
		expect(message).toContain("Nothing was changed");
	});

	it("still lets the switch take them all off on purpose", () => {
		expect(
			refusedRemoval({
				held: HELD,
				submittedIds: [],
				submittedCount: 0,
				removeVariants: true,
				removedVariants: [],
			}),
		).toBeNull();
	});

	it("leaves a product that never had combinations alone", () => {
		expect(
			refusedRemoval({
				held: [],
				submittedIds: [],
				submittedCount: 0,
				removeVariants: false,
				removedVariants: [],
			}),
		).toBeNull();
	});

	it("lets a submission of all-new rows through when the old ones are listed", () => {
		expect(
			refusedRemoval({
				held: HELD,
				submittedIds: [],
				submittedCount: 6,
				removeVariants: false,
				removedVariants: HELD.map((row) => row.id),
			}),
		).toBeNull();
	});
});
