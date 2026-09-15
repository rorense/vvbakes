/**
 * Exercises the attempt counter that sits in front of the order form and the
 * admin sign-in.
 *
 * Every assertion here is about a property that is easy to get subtly wrong and
 * impossible to notice in production until it matters: that the limit is
 * inclusive, that an expired window really does start over, that one bucket
 * cannot brake another, and that the whole thing is unreachable by anyone but
 * the server.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type TestDb } from "./pg";

let db: TestDb;

beforeAll(async () => {
	db = await createTestDb({ seed: false });
}, 120_000);

afterAll(async () => {
	await db?.close();
});

beforeEach(async () => {
	await db.query("delete from rate_limits");
});

const WINDOW = "15 minutes";

/** One attempt. Returns whether it was allowed. */
async function attempt(key: string | null, limit = 3, bucket = "order"): Promise<boolean> {
	const result = await db.query<{ allowed: boolean }>(
		"select record_attempt($1, $2, $3, $4::interval) as allowed",
		[bucket, key, limit, WINDOW],
	);
	return result.rows[0]!.allowed;
}

/** Pretends the key's window opened `minutes` ago. */
async function backdate(key: string, minutes: number, bucket = "order"): Promise<void> {
	await db.query(
		`update rate_limits set window_start = now() - ($1 || ' minutes')::interval
		 where bucket = $2 and key = $3`,
		[String(minutes), bucket, key],
	);
}

async function stored(key: string, bucket = "order") {
	const result = await db.query<{ attempts: number }>(
		"select attempts from rate_limits where bucket = $1 and key = $2",
		[bucket, key],
	);
	return result.rows[0]?.attempts ?? null;
}

describe("record_attempt", () => {
	it("allows up to the limit and refuses the next one", async () => {
		expect(await attempt("a")).toBe(true);
		expect(await attempt("a")).toBe(true);
		// The third is the limit, so it is still allowed.
		expect(await attempt("a")).toBe(true);
		expect(await attempt("a")).toBe(false);
	});

	it("keeps counting after refusing, so hammering does not wait the window out", async () => {
		for (let i = 0; i < 6; i += 1) await attempt("a");
		expect(await stored("a")).toBe(6);
	});

	it("counts each key separately", async () => {
		await attempt("a");
		await attempt("a");
		await attempt("a");
		expect(await attempt("a")).toBe(false);
		expect(await attempt("b")).toBe(true);
	});

	it("counts each bucket separately", async () => {
		for (let i = 0; i < 4; i += 1) await attempt("a", 3, "order");
		expect(await attempt("a", 3, "order")).toBe(false);
		expect(await attempt("a", 3, "login")).toBe(true);
	});

	it("starts over once the window has passed", async () => {
		await attempt("a");
		await attempt("a");
		await attempt("a");
		expect(await attempt("a")).toBe(false);

		await backdate("a", 16);

		expect(await attempt("a")).toBe(true);
		expect(await stored("a")).toBe(1);
	});

	it("does not start over while the window is still open", async () => {
		await attempt("a");
		await backdate("a", 14);
		await attempt("a");
		expect(await stored("a")).toBe(2);
	});

	it("fails open when there is no key to count against", async () => {
		// No address means local development or a proxy that strips the header.
		// Refusing everyone would be far worse than counting no one.
		for (let i = 0; i < 20; i += 1) {
			expect(await attempt(null)).toBe(true);
		}
		expect(await attempt("   ")).toBe(true);

		const rows = await db.query("select * from rate_limits");
		expect(rows.rows).toHaveLength(0);
	});
});

describe("clear_attempts", () => {
	it("lets a key start over", async () => {
		await attempt("a");
		await attempt("a");
		await attempt("a");
		expect(await attempt("a")).toBe(false);

		await db.query("select clear_attempts($1, $2)", ["order", "a"]);

		expect(await attempt("a")).toBe(true);
	});

	it("leaves other buckets and keys alone", async () => {
		await attempt("a", 3, "order");
		await attempt("a", 3, "login");
		await attempt("b", 3, "order");

		await db.query("select clear_attempts($1, $2)", ["login", "a"]);

		expect(await stored("a", "order")).toBe(1);
		expect(await stored("a", "login")).toBeNull();
		expect(await stored("b", "order")).toBe(1);
	});
});

describe("sweep_rate_limits", () => {
	it("drops rows older than a day and keeps the rest", async () => {
		await attempt("old");
		await attempt("recent");
		await backdate("old", 60 * 25);

		await db.query("select sweep_rate_limits()");

		expect(await stored("old")).toBeNull();
		expect(await stored("recent")).toBe(1);
	});
});

describe("who can reach it", () => {
	it("refuses anon and authenticated the functions", async () => {
		const denied = await db.as("anon", null, () =>
			errorOf(() => db.query("select record_attempt('order', 'a', 3, '15 minutes'::interval)")),
		);
		expect(denied).toMatch(/permission denied/i);

		const clearDenied = await db.as("anon", null, () =>
			errorOf(() => db.query("select clear_attempts('order', 'a')")),
		);
		expect(clearDenied).toMatch(/permission denied/i);

		const sweepDenied = await db.as("authenticated", null, () =>
			errorOf(() => db.query("select sweep_rate_limits()")),
		);
		expect(sweepDenied).toMatch(/permission denied/i);
	});

	it("shows anon nothing in the table, even with rows in it", async () => {
		await attempt("a");

		const rows = await db.as("anon", null, () => db.query("select * from rate_limits"));
		expect(rows.rows).toHaveLength(0);
	});
});
