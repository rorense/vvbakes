/**
 * The order of the statements a save makes, asserted directly.
 *
 * This is the first test that runs the real thing. tests/admin-save.test.ts is
 * a hand-written SQL transcription of the same sequence — it is good at the
 * questions a transcription cannot get wrong, like whether a past order keeps
 * pointing at something, and useless at the one it cannot see, which is whether
 * the code still makes those calls in that order.
 *
 * So: a fake PostgREST client that records every call, and assertions about
 * what came out of it. What matters here is the sequence and the payloads, not
 * the database — the database's half is next door.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws on import outside a React Server Component, and the
// module under test imports it deliberately.
vi.mock("server-only", () => ({}));

const { syncRows } = await import("./sync-rows");

type Call = { op: string; table: string; payload?: unknown; filters: string[]; select?: string };

let calls: Call[];
/** Set to a 1-based call number to make that call come back with an error. */
let failAt: number | null;

function fakeClient() {
	function builder(table: string, op: string, payload?: unknown) {
		const call: Call = { op, table, filters: [] };
		if (payload !== undefined) call.payload = payload;

		const self: Record<string, unknown> = {
			eq: (c: string, v: unknown) => (call.filters.push(`eq:${c}=${v}`), self),
			not: (c: string, o: string, v: unknown) => (call.filters.push(`not:${c} ${o} ${v}`), self),
			select: (cols: string) => ((call.select = cols), self),
			then(resolve: (v: unknown) => void) {
				calls.push(call);
				if (failAt !== null && calls.length === failAt) {
					return resolve({ data: null, error: { message: "duplicate key value" } });
				}
				const data =
					call.select && op === "insert"
						? (payload as Array<{ name: string }>).map((row) => ({
								id: `new-${row.name}`,
								name: row.name,
							}))
						: null;
				resolve({ data, error: null });
			},
		};
		return self;
	}

	return {
		from: (table: string) => ({
			delete: () => builder(table, "delete"),
			upsert: (rows: unknown) => builder(table, "upsert", rows),
			insert: (rows: unknown) => builder(table, "insert", rows),
		}),
	} as never;
}

const base = {
	table: "product_options" as const,
	parentColumn: "group_id" as const,
	parentId: "g1",
	describeError: (message: string) => (message.includes("duplicate") ? "clash" : "failed"),
};

beforeEach(() => {
	calls = [];
	failAt = null;
});

describe("the order of the three statements", () => {
	it("deletes what the form no longer names, before writing anything", async () => {
		await syncRows({
			supabase: fakeClient(),
			...base,
			rows: [
				{ id: "keep-1", name: "Chocolate", group_id: "g1" },
				{ name: "Lemon", group_id: "g1" },
			],
		});

		// Delete first. This is what lets two answers swap names in one save.
		expect(calls[0]).toMatchObject({
			op: "delete",
			table: "product_options",
			filters: ["eq:group_id=g1", "not:id in (keep-1)"],
		});
		expect(calls.map((c) => c.op)).toEqual(["delete", "upsert", "insert"]);
	});

	it("clears the lot when the form kept nothing, since there is no empty set to spell", async () => {
		await syncRows({ supabase: fakeClient(), ...base, rows: [{ name: "Lemon", group_id: "g1" }] });

		expect(calls[0]!.filters).toEqual(["eq:group_id=g1"]);
	});

	it("upserts only the rows carrying an id, and inserts only the rest", async () => {
		await syncRows({
			supabase: fakeClient(),
			...base,
			rows: [
				{ id: "keep-1", name: "Chocolate", group_id: "g1" },
				{ name: "Lemon", group_id: "g1" },
			],
		});

		expect(calls[1]).toMatchObject({
			op: "upsert",
			payload: [{ id: "keep-1", name: "Chocolate", group_id: "g1" }],
		});
		// The id is stripped rather than sent as undefined.
		expect(calls[2]!.payload).toEqual([{ name: "Lemon", group_id: "g1" }]);
	});

	it("makes no call at all for a step with nothing to do", async () => {
		await syncRows({ supabase: fakeClient(), ...base, rows: [] });

		expect(calls.map((c) => c.op)).toEqual(["delete"]);
	});
});

describe("reading the new ids back", () => {
	it("is off by default, so an insert asks for no representation", async () => {
		const result = await syncRows({
			supabase: fakeClient(),
			...base,
			rows: [{ name: "Lemon", group_id: "g1" }],
		});

		expect(calls.at(-1)!.select).toBeUndefined();
		expect(result).toEqual({ ok: true, ids: [] });
	});

	it("returns one id per submitted row, in the order they were given", async () => {
		const result = await syncRows({
			supabase: fakeClient(),
			...base,
			trackIds: true,
			rows: [
				{ name: "Lemon", group_id: "g1" },
				{ id: "keep-1", name: "Chocolate", group_id: "g1" },
			],
		});

		expect(calls.at(-1)!.select).toBe("id, name");
		// The row that already had one keeps it; the new one gets what came back.
		expect(result).toEqual({ ok: true, ids: ["new-Lemon", "keep-1"] });
	});
});

describe("a statement that fails", () => {
	it("stops there rather than carrying on to the next one", async () => {
		const result = await syncRows({
			supabase: fakeClient(),
			...base,
			rows: [
				{ id: "keep-1", name: "Chocolate", group_id: "g1" },
				{ name: "Lemon", group_id: "g1" },
			],
		});
		expect(calls).toHaveLength(3);

		calls = [];
		failAt = 1;
		const failed = await syncRows({
			supabase: fakeClient(),
			...base,
			rows: [
				{ id: "keep-1", name: "Chocolate", group_id: "g1" },
				{ name: "Lemon", group_id: "g1" },
			],
		});

		expect(result).toEqual({ ok: true, ids: [] });
		expect(failed).toEqual({ ok: false, error: "clash" });
		// The delete failed, so nothing was written.
		expect(calls).toHaveLength(1);
	});

	it("is described by the caller, so each table keeps its own wording", async () => {
		failAt = 1;
		const result = await syncRows({
			supabase: fakeClient(),
			...base,
			rows: [],
			describeError: () => "Two of those extras have the same name.",
		});

		expect(result).toEqual({ ok: false, error: "Two of those extras have the same name." });
	});
});
