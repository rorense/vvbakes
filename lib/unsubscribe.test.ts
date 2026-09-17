/**
 * Saying no to the feedback request.
 *
 * The header shape is the part worth pinning down: RFC 8058 is what makes Gmail
 * and Outlook draw an unsubscribe button of their own, and getting it subtly
 * wrong fails silently. Nobody sees a missing button.
 *
 * The rest is about the one rule this module exists to keep: a database that
 * will not answer must mean one extra email, never a shop that has silently
 * stopped asking anybody.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "./types";

// `server-only` throws on import outside a React Server Component, and
// lib/optouts.ts imports it. Same shim as lib/instagram.test.ts. Note that
// lib/unsubscribe.ts deliberately does not, which is the whole point of the
// split and is asserted at the bottom of this file.
vi.mock("server-only", () => ({}));

let selectResult: { data: unknown; error: { message: string } | null } = {
	data: null,
	error: null,
};
let upsertError: { message: string } | null = null;
let insertError: { message: string } | null = null;
let selectThrows = false;
const writes: Array<{ table: string; method: string; payload: unknown }> = [];

function fakeClient() {
	return {
		from(table: string) {
			const builder: Record<string, unknown> = {
				select: () => builder,
				eq: (...args: unknown[]) => {
					writes.push({ table, method: "eq", payload: args });
					return builder;
				},
				maybeSingle: async () => {
					if (selectThrows) throw new Error("connection lost");
					return selectResult;
				},
				upsert: async (payload: unknown, options: unknown) => {
					writes.push({ table, method: "upsert", payload: { payload, options } });
					return { error: upsertError };
				},
				insert: async (payload: unknown) => {
					writes.push({ table, method: "insert", payload });
					return { error: insertError };
				},
			};
			return builder;
		},
	};
}

let configured = true;
vi.mock("./supabase/env", () => ({ hasSupabaseConfig: () => configured }));
vi.mock("./supabase/admin", () => ({ createAdminClient: () => fakeClient() }));

// Two modules, one subject. The pure half is importable anywhere, which is what
// lets scripts/send-test-email.mts build the real headers; the half that talks
// to the table is server-only. See the docblock on lib/unsubscribe.ts.
const { OPTED_OUT, normaliseEmail, unsubscribeHeaders } = await import("./unsubscribe");
const { hasOptedOut, recordOptOut } = await import("./optouts");

const ORDER = {
	id: "order-1",
	token: "0123456789abcdef0123456789abcdef",
	reference: "VV1042",
	customerEmail: "  Alex@Example.com ",
} as unknown as Order;

beforeEach(() => {
	writes.length = 0;
	selectResult = { data: null, error: null };
	upsertError = null;
	insertError = null;
	selectThrows = false;
	configured = true;
	vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("normaliseEmail", () => {
	it("folds case and trims, so one person cannot become two rows", () => {
		expect(normaliseEmail("  Alex@Example.COM ")).toBe("alex@example.com");
	});
});

describe("unsubscribeHeaders", () => {
	it("gives the provider a one-click target and a mailto to fall back on", () => {
		const headers = unsubscribeHeaders({
			siteUrl: "https://vvbakes.co.nz",
			token: "0123456789abcdef0123456789abcdef",
			contactEmail: "hello@vvbakes.co.nz",
		});

		expect(headers["List-Unsubscribe"]).toBe(
			"<https://vvbakes.co.nz/api/unsubscribe/0123456789abcdef0123456789abcdef>, " +
				"<mailto:hello@vvbakes.co.nz?subject=Unsubscribe>",
		);
		// Without this exact value no mail client draws its own button, and the
		// whole header degrades to a link nobody sees.
		expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
	});

	// The URL in the header is the POST-only route, never the page. A page that
	// acted on GET would be unsubscribing people whose employer scans their mail.
	it("points at the API route rather than the page with the button on it", () => {
		const headers = unsubscribeHeaders({ siteUrl: "https://vvbakes.co.nz", token: "abc" });
		expect(headers["List-Unsubscribe"]).toContain("/api/unsubscribe/abc");
		expect(headers["List-Unsubscribe"]).not.toContain("<https://vvbakes.co.nz/unsubscribe/");
	});

	it("prints no dead mailto when the shop has no contact address", () => {
		const headers = unsubscribeHeaders({ siteUrl: "https://vvbakes.co.nz", token: "abc" });
		expect(headers["List-Unsubscribe"]).toBe("<https://vvbakes.co.nz/api/unsubscribe/abc>");
	});
});

describe("hasOptedOut", () => {
	it("looks the address up in its normalised form", async () => {
		await hasOptedOut("  Alex@Example.com ");
		expect(writes).toContainEqual({
			table: "feedback_optouts",
			method: "eq",
			payload: ["email", "alex@example.com"],
		});
	});

	it("is true when there is a row and false when there is not", async () => {
		selectResult = { data: { email: "alex@example.com" }, error: null };
		expect(await hasOptedOut("alex@example.com")).toBe(true);

		selectResult = { data: null, error: null };
		expect(await hasOptedOut("alex@example.com")).toBe(false);
	});

	// The deliberate direction of the failure. Failing closed would stop the job
	// asking anybody and nobody would notice for a month.
	it("fails open, so a broken database costs one email rather than all of them", async () => {
		selectResult = { data: null, error: { message: "relation does not exist" } };
		expect(await hasOptedOut("alex@example.com")).toBe(false);

		selectThrows = true;
		expect(await hasOptedOut("alex@example.com")).toBe(false);

		selectThrows = false;
		configured = false;
		expect(await hasOptedOut("alex@example.com")).toBe(false);
	});
});

describe("recordOptOut", () => {
	it("stores the normalised address against the order it came from", async () => {
		expect(await recordOptOut(ORDER, "one-click")).toBe(true);

		const upsert = writes.find((write) => write.method === "upsert");
		expect(upsert?.table).toBe("feedback_optouts");
		expect((upsert?.payload as { payload: unknown }).payload).toEqual({
			email: "alex@example.com",
			order_id: "order-1",
			source: "one-click",
		});
		// Pressing it twice must leave the first date alone.
		expect((upsert?.payload as { options: unknown }).options).toEqual({
			onConflict: "email",
			ignoreDuplicates: true,
		});
	});

	// A `note`, not an email event: the admin's "an email didn't send" banner
	// keys on the failure types, and nothing failed here.
	it("writes a note on the order rather than a failure", async () => {
		await recordOptOut(ORDER, "link");

		const insert = writes.find((write) => write.method === "insert");
		expect(insert?.table).toBe("order_events");
		expect(insert?.payload).toEqual({
			order_id: "order-1",
			type: "note",
			data: { unsubscribed: true, source: "link" },
		});
	});

	it("says it failed when the write failed, so the page can tell them", async () => {
		upsertError = { message: "connection lost" };
		expect(await recordOptOut(ORDER, "link")).toBe(false);
	});

	// The opt-out is the thing that had to happen. Losing the trail entry is
	// untidy, not a reason to tell somebody their unsubscribe did not work.
	it("still reports success when only the trail entry failed", async () => {
		insertError = { message: "connection lost" };
		expect(await recordOptOut(ORDER, "link")).toBe(true);
	});
});

describe("the split between the two modules", () => {
	// The regression this file exists to stop coming back. On 2026-09-18 the
	// headers lived beside the database calls, so `npm run emails:test` threw on
	// import under tsx and the one check that can prove a mail client reads the
	// header could not be run at all.
	it("keeps the pure half importable without the server-only shim", async () => {
		const source = await import("node:fs").then((fs) =>
			fs.readFileSync(new URL("./unsubscribe.ts", import.meta.url), "utf8"),
		);
		expect(source).not.toContain('import "server-only"');
	});
});

describe("the sentinel", () => {
	// lib/email.ts returns it and lib/feedback.ts compares on it. If it drifts,
	// every opt-out starts being counted as a delivery failure.
	it("is the string both sides agree on", () => {
		expect(OPTED_OUT).toBe("unsubscribed");
	});
});
