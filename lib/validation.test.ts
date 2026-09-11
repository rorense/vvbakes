/**
 * The inspiration link, which is the only part of an order a stranger writes
 * that ends up inside an href. Everything else they send is rendered as text.
 */
import { describe, expect, it } from "vitest";
import { isHttpUrl, orderInputSchema } from "./validation";

function parseLink(inspirationUrl: string) {
	return orderInputSchema.safeParse({
		items: [],
		pickupDate: "2026-09-20",
		fulfilment: "pickup",
		customerName: "Sam Taylor",
		customerEmail: "sam@example.com",
		customerPhone: "021 555 0100",
		inspirationUrl,
	});
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

describe("the inspiration link on an order", () => {
	it("assumes https for a link pasted without one", () => {
		const parsed = parseLink("www.pinterest.com/pin/12345/");
		expect(parsed.success && parsed.data.inspirationUrl).toBe(
			"https://www.pinterest.com/pin/12345/",
		);
	});

	it("leaves a link that already has a scheme alone", () => {
		const parsed = parseLink("http://example.com/cake.jpg");
		expect(parsed.success && parsed.data.inspirationUrl).toBe("http://example.com/cake.jpg");
	});

	it("turns an empty field into nothing, not an empty string", () => {
		const parsed = parseLink("   ");
		expect(parsed.success && parsed.data.inspirationUrl).toBeNull();
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
