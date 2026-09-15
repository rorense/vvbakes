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
import { briefKey, briefPhotoIds, isEmptyBrief, MAX_BRIEF_NOTE, normaliseBrief } from "./brief";
import { cartLineKey } from "./cart";

const PRODUCT = "11111111-1111-4111-8111-111111111111";

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
});

describe("isEmptyBrief", () => {
	it("agrees with normaliseBrief about what counts as nothing", () => {
		expect(isEmptyBrief({ note: "  " })).toBe(true);
		expect(isEmptyBrief({ photoIds: ["a"] })).toBe(false);
		expect(isEmptyBrief({ inspirationUrl: "https://example.com" })).toBe(false);
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
		expect(cartLineKey(PRODUCT, "v1", ["e1"], { note: "No sprinkles" })).toBe(
			cartLineKey(PRODUCT, "v1", ["e1"], { note: "No sprinkles" }),
		);
	});

	it("still sorts the extras, so the picking order cannot split a line", () => {
		expect(cartLineKey(PRODUCT, null, ["b", "a"], { note: "x" })).toBe(
			cartLineKey(PRODUCT, null, ["a", "b"], { note: "x" }),
		);
	});

	it("splits a described line from an identical undescribed one", () => {
		expect(cartLineKey(PRODUCT, null, [], { note: "No sprinkles" })).not.toBe(
			cartLineKey(PRODUCT, null, []),
		);
	});
});
