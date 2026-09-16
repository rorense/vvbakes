/**
 * Keeps scripts/expected-schema.mjs honest.
 *
 * `npm run check` works through a hand-written list of tables and functions and
 * reports "every table is there". That claim is only worth anything if the list
 * is the whole schema, and a hand-written list of a schema that gains a table
 * most weeks is the definition of something that rots quietly: on 2026-09-16 it
 * was five tables behind within hours of the migrations that added them, and
 * went on reporting a clean bill of health to a project missing all five.
 *
 * So the list is compared with the real thing. The migrations are applied to
 * PGlite by tests/pg.ts — the same harness the rest of the SQL tests use — and
 * both directions are checked: a table in the schema and not in the list is the
 * rot this is here to catch, and a table in the list and not in the schema is a
 * check that will fail for everybody until someone deletes the line.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FUNCTIONS, TABLES, UNPROBED_FUNCTIONS } from "../scripts/expected-schema.mjs";
import { createTestDb, type TestDb } from "./pg";

let db: TestDb;

beforeAll(async () => {
	// No seed: this is about the shape of the schema, not what is in it.
	db = await createTestDb({ seed: false });
}, 180_000);

afterAll(async () => {
	await db?.close();
});

describe("the tables npm run check looks for", () => {
	it("is exactly the set the migrations create", async () => {
		const result = await db.query<{ table_name: string }>(
			`select table_name from information_schema.tables
			 where table_schema = 'public' and table_type = 'BASE TABLE'`,
		);
		const actual = result.rows.map((row) => row.table_name).sort();

		expect([...TABLES].sort()).toEqual(actual);
	});
});

describe("the functions npm run check probes", () => {
	it("is every function in the schema except the ones deliberately skipped", async () => {
		const result = await db.query<{ proname: string }>(
			`select distinct p.proname from pg_proc p
			 join pg_namespace n on n.oid = p.pronamespace
			 where n.nspname = 'public'`,
		);
		const actual = result.rows.map((row) => row.proname).sort();

		const accounted = [...FUNCTIONS.map(([name]) => name), ...UNPROBED_FUNCTIONS].sort();

		expect(accounted).toEqual(actual);
	});

	it("names each function only once", () => {
		const names = FUNCTIONS.map(([name]) => name);
		expect(new Set(names).size).toBe(names.length);
	});
});
