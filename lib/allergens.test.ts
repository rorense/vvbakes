import { describe, expect, it } from "vitest";
import { allergenSentence, allergensFor } from "./allergens";
import type { Allergen } from "./types";

function product(allergens: Allergen[]) {
	return { allergens };
}

function variant(allergens: Allergen[]) {
	return { allergens };
}

describe("allergensFor", () => {
	it("is the product's own list when nothing is chosen", () => {
		expect(allergensFor(product(["gluten", "dairy"]), null)).toEqual(["gluten", "dairy"]);
	});

	it("adds the variant's on top of the product's", () => {
		expect(allergensFor(product(["gluten", "dairy"]), variant(["nuts"]))).toEqual([
			"gluten",
			"dairy",
			"nuts",
		]);
	});

	it("never lets a variant drop one of the product's", () => {
		// The whole point of the model: an empty variant list means "adds
		// nothing", never "contains nothing". Under-declaring is the failure
		// that hurts someone.
		expect(allergensFor(product(["gluten", "dairy", "egg"]), variant([]))).toEqual([
			"gluten",
			"dairy",
			"egg",
		]);
	});

	it("does not repeat one that appears on both", () => {
		expect(allergensFor(product(["gluten"]), variant(["gluten", "soy"]))).toEqual([
			"gluten",
			"soy",
		]);
	});

	it("reads in the same order however the two lists were stored", () => {
		expect(allergensFor(product(["sesame", "dairy"]), variant(["gluten"]))).toEqual([
			"gluten",
			"dairy",
			"sesame",
		]);
	});
});

describe("allergenSentence", () => {
	it("reads as a list a person would say out loud", () => {
		expect(allergenSentence([])).toBe("");
		expect(allergenSentence(["nuts"])).toBe("tree nuts");
		expect(allergenSentence(["nuts", "soy"])).toBe("tree nuts and soy");
		expect(allergenSentence(["nuts", "soy", "sesame"])).toBe("tree nuts, soy and sesame");
	});
});
