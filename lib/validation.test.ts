/**
 * The inspiration link, which is the only part of an order a stranger writes
 * that ends up inside an href. Everything else they send is rendered as text.
 */
import { describe, expect, it } from "vitest";
import {
	fieldErrorsOf,
	isHttpUrl,
	orderDetailsSchema,
	orderInputSchema,
	productSchema,
} from "./validation";

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
		extraUnitPriceCents: "",
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
		mixVariants: false,
		briefNoun: "",
		wantsNote: true,
		noteHint: null,
		notePlaceholder: null,
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

/**
 * The form the owner corrects an order with. Everything arrives as a string,
 * because it comes off a FormData, so the defaults here are the strings a
 * browser actually submits for an untouched form.
 */
function parseDetails(overrides: Record<string, string> = {}) {
	return orderDetailsSchema.safeParse({
		id: "11111111-1111-4111-8111-111111111111",
		pickupDate: "2026-09-20",
		pickupTime: "",
		fulfilment: "pickup",
		customerName: "Sam Taylor",
		customerEmail: "sam@example.com",
		customerPhone: "021 555 0100",
		deliveryAddress: "",
		notes: "",
		...overrides,
	});
}

describe("correcting an order's details", () => {
	it("keeps the date the owner typed", () => {
		const parsed = parseDetails({ pickupDate: "2026-10-03" });
		expect(parsed.success && parsed.data.pickupDate).toBe("2026-10-03");
	});

	it("does not care whether the calendar would have sold that date", () => {
		// A date long past, on whatever weekday it happens to be. Lead time, the
		// booking window and capacity are checks on a customer; she is the one
		// who decides what can be baked, and the order page warns rather than
		// refuses. See the comment on the schema.
		expect(parseDetails({ pickupDate: "2020-01-01" }).success).toBe(true);
	});

	it("refuses something that is not a date at all", () => {
		expect(parseDetails({ pickupDate: "" }).success).toBe(false);
		expect(parseDetails({ pickupDate: "3 October" }).success).toBe(false);
		expect(parseDetails({ pickupDate: "2026-13-40" }).success).toBe(false);
	});

	it("drops the seconds a time column carries and a time input will not take", () => {
		const parsed = parseDetails({ pickupTime: "16:30:00" });
		expect(parsed.success && parsed.data.pickupTime).toBe("16:30");
	});

	it("reads a cleared time as no time rather than as an empty one", () => {
		const parsed = parseDetails({ pickupTime: "" });
		expect(parsed.success && parsed.data.pickupTime).toBeNull();
	});

	it("clears the address rather than storing an empty string", () => {
		const parsed = parseDetails({ deliveryAddress: "   " });
		expect(parsed.success && parsed.data.deliveryAddress).toBeNull();
	});

	it("will not let a delivery lose its address", () => {
		const parsed = parseDetails({ fulfilment: "delivery", deliveryAddress: "" });
		expect(parsed.success).toBe(false);
		expect(parsed.success || fieldErrorsOf(parsed.error).deliveryAddress).toBe(
			"A delivery needs an address",
		);
	});

	it("takes a delivery that has one", () => {
		const parsed = parseDetails({
			fulfilment: "delivery",
			deliveryAddress: "12 Some Road, Flat Bush",
		});
		expect(parsed.success && parsed.data.deliveryAddress).toBe("12 Some Road, Flat Bush");
	});

	it("refuses an email the confirmation could never reach", () => {
		expect(parseDetails({ customerEmail: "sam@" }).success).toBe(false);
		expect(parseDetails({ customerEmail: "" }).success).toBe(false);
	});

	it("holds the columns' own lengths, so a correction cannot outgrow the row", () => {
		expect(parseDetails({ customerName: "x".repeat(81) }).success).toBe(false);
		expect(parseDetails({ customerPhone: "0".repeat(31) }).success).toBe(false);
		expect(parseDetails({ deliveryAddress: "x".repeat(301) }).success).toBe(false);
		expect(parseDetails({ notes: "x".repeat(1001) }).success).toBe(false);
	});

	it("refuses an address one character too long rather than quietly dropping it", () => {
		// `optionalText` would have caught this into null, which on this form
		// means "she cleared the address" — the opposite of what she did.
		const parsed = parseDetails({ fulfilment: "delivery", deliveryAddress: "x".repeat(301) });
		expect(parsed.success).toBe(false);
	});
});
