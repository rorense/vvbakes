/**
 * The brief, and the part of it that decides which basket line is which.
 *
 * The rule under test is an agreement with `place_order`: the browser and the
 * database have to fold the same lines together and keep the same lines apart,
 * or the total on the order page is not the total that gets charged. The
 * database's half of it lives in tests/schema.test.ts under "the custom cake as
 * a product".
 */
import { describe, expect, it } from "vitest";
import {
	briefKey,
	briefPhotoIds,
	frostingLabel,
	MAX_BRIEF_FLAVOUR,
	MAX_BRIEF_NOTE,
	normaliseBrief,
} from "./brief";
import { cartLineKey } from "./cart";

const PRODUCT = "11111111-1111-4111-8111-111111111111";

/** Two extras whose ids sort the other way round from the order they are in. */
const BOX = { id: "b", qty: 1 };
const CANDLES = { id: "a", qty: 1 };

describe("normaliseBrief", () => {
	it("treats absent, empty and whitespace-only as no brief at all", () => {
		expect(normaliseBrief(undefined)).toBeUndefined();
		expect(normaliseBrief(null)).toBeUndefined();
		expect(normaliseBrief({})).toBeUndefined();
		expect(normaliseBrief({ note: "   \n\t " })).toBeUndefined();
		expect(normaliseBrief({ note: "", inspirationUrl: "", photoIds: [] })).toBeUndefined();
	});

	it("keeps only the parts that were filled in", () => {
		expect(normaliseBrief({ note: "  No sprinkles  ", inspirationUrl: " " })).toEqual({
			note: "No sprinkles",
		});
	});

	it("leaves the photo order alone, because the order is part of what they said", () => {
		expect(normaliseBrief({ photoIds: ["b", "a", "c"] })?.photoIds).toEqual(["b", "a", "c"]);
	});

	it("caps a line at three photos and a note at the column's length", () => {
		expect(normaliseBrief({ photoIds: ["a", "b", "c", "d"] })?.photoIds).toEqual(["a", "b", "c"]);
		const long = normaliseBrief({ note: "x".repeat(MAX_BRIEF_NOTE + 50) });
		expect(long?.note).toHaveLength(MAX_BRIEF_NOTE);
	});

	it("drops a photo id that is not a string, rather than carrying a hole", () => {
		const brief = { photoIds: ["a", "", "b"] };
		expect(normaliseBrief(brief)?.photoIds).toEqual(["a", "b"]);
	});

	it("keeps a flavour of their own, trimmed and capped like the note", () => {
		expect(normaliseBrief({ customFlavour: "  Pandan  " })).toEqual({ customFlavour: "Pandan" });
		const long = normaliseBrief({ customFlavour: "x".repeat(MAX_BRIEF_FLAVOUR + 50) });
		expect(long?.customFlavour).toHaveLength(MAX_BRIEF_FLAVOUR);
	});

	it("lets the tick box win over the frosting text, because they are one answer", () => {
		// The case that would otherwise reach an order saying two different things
		// about one frosting. `place_order` blanks it again on the way in, and the
		// column has a constraint refusing the row outright.
		expect(normaliseBrief({ frosting: "Pale pink", frostingMatchesFlavour: true })).toEqual({
			frostingMatchesFlavour: true,
		});
	});

	it("treats a ticked box on its own as something they said", () => {
		// "Chocolate frosting on the chocolate ones" is a real instruction even
		// when nothing was typed anywhere, so the line has to carry a brief.
		expect(normaliseBrief({ frostingMatchesFlavour: true })).toEqual({
			frostingMatchesFlavour: true,
		});
	});

	it("drops an unticked box rather than storing false", () => {
		// False and absent are the same answer, and a line saved before any of
		// this existed has to key the same as one saved since.
		expect(normaliseBrief({ note: "x", frostingMatchesFlavour: false })).toEqual({ note: "x" });
		expect(normaliseBrief({ frostingMatchesFlavour: false })).toBeUndefined();
	});
});

describe("frostingLabel", () => {
	it("says the same thing wherever the frosting is shown back", () => {
		expect(frostingLabel(null, true)).toBe("To match the flavour");
		expect(frostingLabel("  Pale pink  ", false)).toBe("Pale pink");
	});

	it("is null when they said nothing, so nothing is rendered", () => {
		expect(frostingLabel(null, false)).toBeNull();
		expect(frostingLabel("   ", false)).toBeNull();
		expect(frostingLabel(undefined, undefined)).toBeNull();
	});
});

describe("briefPhotoIds", () => {
	it("is empty for the briefs that are only words", () => {
		expect(briefPhotoIds({ note: "No sprinkles" })).toEqual([]);
		expect(briefPhotoIds(undefined)).toEqual([]);
	});
});

describe("briefKey", () => {
	it("is empty for no brief, so a line that has none keeps the key it always had", () => {
		expect(briefKey(undefined)).toBe("");
		expect(briefKey({ note: "   " })).toBe("");
	});

	it("is the same for two briefs that say the same thing", () => {
		expect(briefKey({ note: " Chocolate " })).toBe(briefKey({ note: "Chocolate" }));
	});

	it("is different for two briefs that say different things", () => {
		expect(briefKey({ note: "Chocolate" })).not.toBe(briefKey({ note: "Lemon" }));
		expect(briefKey({ note: "a" })).not.toBe(briefKey({ note: "a", photoIds: ["x"] }));
	});

	it("splits two boxes of cupcakes asked for in two flavours", () => {
		expect(briefKey({ customFlavour: "Pandan" })).not.toBe(briefKey({ customFlavour: "Ube" }));
	});

	it("is the same for a brief that sent both halves of the frosting answer and one that sent the tick", () => {
		// `place_order` normalises the pair the same way before it groups, so the
		// browser's idea of which lines are one line and the database's agree.
		expect(briefKey({ frosting: "Pale pink", frostingMatchesFlavour: true })).toBe(
			briefKey({ frostingMatchesFlavour: true }),
		);
	});

	it("does not confuse a flavour with a frosting that reads the same", () => {
		expect(briefKey({ customFlavour: "Pandan" })).not.toBe(briefKey({ frosting: "Pandan" }));
	});

	it("does not confuse a note with a link that reads the same", () => {
		// The key is built from a JSON array rather than by joining on a
		// separator, so no note can be typed that impersonates another field.
		expect(briefKey({ note: "https://example.com" })).not.toBe(
			briefKey({ inspirationUrl: "https://example.com" }),
		);
	});
});

describe("cartLineKey", () => {
	it("is unchanged by a brief nobody filled in", () => {
		// The compatibility case: every cart saved before briefs existed, and
		// nearly every line saved since.
		expect(cartLineKey(PRODUCT, null, [], undefined)).toBe(cartLineKey(PRODUCT, null, []));
		expect(cartLineKey(PRODUCT, null, [], { note: "" })).toBe(cartLineKey(PRODUCT, null, []));
	});

	it("splits two otherwise identical lines that were described differently", () => {
		// Two custom cakes for two parties. Under the old key these were one line
		// of two, and the second brief was gone.
		expect(cartLineKey(PRODUCT, "v1", [], { note: "For Sam" })).not.toBe(
			cartLineKey(PRODUCT, "v1", [], { note: "For Alex" }),
		);
	});

	it("keeps two identical lines together, brief and all", () => {
		expect(cartLineKey(PRODUCT, "v1", [{ id: "e1", qty: 1 }], { note: "No sprinkles" })).toBe(
			cartLineKey(PRODUCT, "v1", [{ id: "e1", qty: 1 }], { note: "No sprinkles" }),
		);
	});

	it("still sorts the extras, so the picking order cannot split a line", () => {
		expect(cartLineKey(PRODUCT, null, [BOX, CANDLES], { note: "x" })).toBe(
			cartLineKey(PRODUCT, null, [CANDLES, BOX], { note: "x" }),
		);
	});

	it("splits a described line from an identical undescribed one", () => {
		expect(cartLineKey(PRODUCT, null, [], { note: "No sprinkles" })).not.toBe(
			cartLineKey(PRODUCT, null, []),
		);
	});

	it("splits four cupcakes in pandan from four of the same in ube", () => {
		// Two lines, two flavours, two batches to bake. Folded together, one of
		// the flavours would simply be gone.
		expect(cartLineKey(PRODUCT, "v1", [], { customFlavour: "Pandan" })).not.toBe(
			cartLineKey(PRODUCT, "v1", [], { customFlavour: "Ube" }),
		);
	});

	it("splits a matching frosting from a named one", () => {
		expect(cartLineKey(PRODUCT, null, [], { frostingMatchesFlavour: true })).not.toBe(
			cartLineKey(PRODUCT, null, [], { frosting: "Pale pink" }),
		);
	});
});
