/**
 * The order token in `/order/<token>` is the only thing protecting a customer's
 * order, and both Vercel scripts report the real pathname by default. If this
 * rule ever regresses, every order link the site has issued ends up sitting in
 * an analytics dashboard, and nothing else in the build would notice.
 *
 * So the interesting assertion here is the negative one: the token must not
 * appear anywhere in what comes back.
 */
import { describe, expect, it } from "vitest";
import { redactUrl } from "./analytics";

const ORIGIN = "https://vvbakes.co.nz";

describe("order tokens", () => {
	const TOKENS = [
		"9f8b7c6d5e4f3a2b1c0d",
		"tok_live_AbCdEf123456",
		"a.b-c_d~e",
		"UPPER-and-lower-99",
	];

	it.each(TOKENS)("never lets %s through", (token) => {
		const result = redactUrl(`${ORIGIN}/order/${token}`);
		expect(result).not.toBeNull();
		expect(result).not.toContain(token);
		expect(result).toBe(`${ORIGIN}/order/[token]`);
	});

	it("keeps the token out even with a query string and a hash", () => {
		const result = redactUrl(`${ORIGIN}/order/secret123?utm_source=email#total`);
		expect(result).not.toContain("secret123");
		expect(result).toBe(`${ORIGIN}/order/[token]?utm_source=email#total`);
	});

	it("keeps the token out of a deeper path under it", () => {
		const result = redactUrl(`${ORIGIN}/order/secret123/anything`);
		expect(result).not.toContain("secret123");
		expect(result).toBe(`${ORIGIN}/order/[token]/anything`);
	});

	it("leaves the order form itself alone, token or not", () => {
		expect(redactUrl(`${ORIGIN}/order`)).toBe(`${ORIGIN}/order`);
		expect(redactUrl(`${ORIGIN}/order?date=2026-10-01`)).toBe(`${ORIGIN}/order?date=2026-10-01`);
	});
});

describe("the admin", () => {
	it.each([
		"/admin",
		"/admin/",
		"/admin/login",
		"/admin/orders",
		"/admin/orders/7f3a1b2c-0000-4000-8000-000000000001",
		"/admin/products/new",
	])("drops %s", (pathname) => {
		expect(redactUrl(`${ORIGIN}${pathname}`)).toBeNull();
	});

	it("does not swallow a public path that merely starts with the same letters", () => {
		expect(redactUrl(`${ORIGIN}/administrator`)).toBe(`${ORIGIN}/administrator`);
	});
});

describe("everything else", () => {
	it.each(["/", "/shop", "/shop/triple-chocolate-cookies", "/menu", "/sitemap.xml"])(
		"passes %s through untouched",
		(pathname) => {
			expect(redactUrl(`${ORIGIN}${pathname}`)).toBe(`${ORIGIN}${pathname}`);
		},
	);

	it("drops anything it cannot parse rather than guessing it is safe", () => {
		expect(redactUrl("not a url")).toBeNull();
		expect(redactUrl("")).toBeNull();
		expect(redactUrl("/order/secret123")).toBeNull();
	});
});
