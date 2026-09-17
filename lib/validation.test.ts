/**
 * The inspiration link, which is the only part of an order a stranger writes
 * that ends up inside an href. Everything else they send is rendered as text.
 */
import { describe, expect, it } from "vitest";
import { isHttpUrl, orderInputSchema, productSchema } from "./validation";

/**
 * The link belongs to the line it describes, not to the order: a basket with
 * two custom cakes in it is two briefs. So it is parsed as part of an item.
 */
function parseLink(inspirationUrl: string) {
	return orderInputSchema.safeParse({
		items: [
			{
				productId: "11111111-1111-4111-8111-111111111111",
				qty: 1,
				inspirationUrl,
			},
		],
		pickupDate: "2026-09-20",
		fulfilment: "pickup",
		customerName: "Sam Taylor",
		customerEmail: "sam@example.com",
		customerPhone: "021 555 0100",
	});
}

/** The parsed link off the first line, or undefined when parsing failed. */
function linkOf(parsed: ReturnType<typeof parseLink>) {
	return parsed.success ? parsed.data.items[0]?.inspirationUrl : undefined;
}

describe("isHttpUrl", () => {
	it("accepts the two schemes a browser can safely follow", () => {
		expect(isHttpUrl("https://www.pinterest.com/pin/1/")).toBe(true);
		expect(isHttpUrl("http://example.com")).toBe(true);
	});

	it("refuses schemes that execute or carry their own payload", () => {
		expect(isHttpUrl("javascript:alert(1)")).toBe(false);
		expect(isHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
		expect(isHttpUrl("vbscript:msgbox(1)")).toBe(false);
		expect(isHttpUrl("file:///etc/passwd")).toBe(false);
	});

	it("refuses anything that is not a URL at all", () => {
		expect(isHttpUrl("pinterest.com/pin/1")).toBe(false);
		expect(isHttpUrl("")).toBe(false);
		expect(isHttpUrl(null)).toBe(false);
	});
});

describe("the inspiration link on an order line", () => {
	it("assumes https for a link pasted without one", () => {
		expect(linkOf(parseLink("www.pinterest.com/pin/12345/"))).toBe(
			"https://www.pinterest.com/pin/12345/",
		);
	});

	it("leaves a link that already has a scheme alone", () => {
		expect(linkOf(parseLink("http://example.com/cake.jpg"))).toBe("http://example.com/cake.jpg");
	});

	it("turns an empty field into nothing, not an empty string", () => {
		expect(linkOf(parseLink("   "))).toBeNull();
	});

	it("refuses a scheme that would run when clicked", () => {
		const parsed = parseLink("javascript:alert(1)");
		expect(parsed.success).toBe(false);
	});

	it("refuses a link long enough to overflow the column once a scheme is added", () => {
		const parsed = parseLink(`example.com/${"a".repeat(500)}`);
		expect(parsed.success).toBe(false);
	});
});

/**
 * How many of an extra a customer may add, as the product form submits it.
 *
 * Everything in that form arrives as the string in the box, so the box is what
 * has to be parsed. Blank matters most: it is what a row typed before this
 * field existed sends, and it has to mean the tick box the extra already was
 * rather than a save the admin refuses.
 */
function parseMaxQty(maxQty: unknown) {
	return productSchema.safeParse({
		name: "Cupcakes",
		slug: "cupcakes",
		categoryId: "",
		description: "",
		unitPriceCents: "3",
		unitLabel: "each",
		qtyStep: "1",
		minPerOrder: "",
		imagePath: "",
		imageAlt: "",
		isAvailable: true,
		isFeatured: false,
		availabilityNote: "",
		allergens: [],
		sortOrder: "1",
		priceOnRequest: false,
		wantsBrief: false,
		wantsCustomFlavour: false,
		tiers: [],
		priceGuide: [],
		priceGuideNote: "",
		variantLabel: "Flavour",
		removedVariants: [],
		removeVariants: false,
		optionGroups: [],
		variants: [],
		extras: [{ name: "Candles", description: "", priceCents: "3", maxQty, isAvailable: true }],
	});
}

describe("how many of an extra one item may carry", () => {
	it("takes the number as the string the box holds", () => {
		const parsed = parseMaxQty("24");
		expect(parsed.success && parsed.data.extras[0]?.maxQty).toBe(24);
	});

	it("reads a blank box as one, which is the tick box it already was", () => {
		const parsed = parseMaxQty("");
		expect(parsed.success && parsed.data.extras[0]?.maxQty).toBe(1);
	});

	it("refuses anything that is not a whole number from 1 to 99", () => {
		// The ceiling matches the check constraint on the column, so a save the
		// admin accepts is one the database accepts.
		expect(parseMaxQty("lots").success).toBe(false);
		expect(parseMaxQty("100").success).toBe(false);
		expect(parseMaxQty("0").success).toBe(false);
		expect(parseMaxQty("2.5").success).toBe(false);
	});
});
