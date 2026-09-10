/**
 * Boots a real PostgreSQL instance in-process (PGlite, Postgres 18 compiled to
 * WASM) with the project's migrations applied, so the SQL that actually runs in
 * production can be tested without Docker or a hosted project.
 *
 * What is shimmed, and why it is safe to shim:
 *   - `auth.users` / `auth.uid()`: Supabase-managed, and nothing under test
 *     depends on their internals — only on `is_admin()` reading `admins`.
 *   - the `anon` / `authenticated` / `service_role` roles: created empty so the
 *     RLS migration's `to <role>` clauses parse and apply.
 *   - `storage.*`: the storage migration is skipped entirely (see MIGRATIONS).
 *
 * Everything else — the tables, constraints, triggers, RLS policies,
 * `price_for_qty` and `place_order` — is the real file, unmodified.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const SEED_FILE = join(process.cwd(), "supabase", "seed.sql");

/**
 * The storage migration needs Supabase's `storage` schema, which only exists in
 * a real project. Its policies are verified by hand against the hosted project
 * instead (see README, "Verifying row level security").
 */
const SKIP_MIGRATIONS = [/_storage\.sql$/];

/**
 * Deliberately no extensions. A new Supabase project has only core PostgreSQL,
 * so the migrations must not reach for pgcrypto or anything else — enabling it
 * here would hide exactly the kind of failure that only shows up on a real
 * project.
 */
const SUPABASE_SHIM = `
create schema if not exists auth;

create table if not exists auth.users (
	id uuid primary key default gen_random_uuid(),
	email text unique
);

-- Supabase derives the current user from the request JWT. In tests we set it
-- directly with set_config('request.jwt.claim.sub', ...).
create or replace function auth.uid() returns uuid
language sql stable as $shim$
	select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$shim$;

do $shim$
begin
	if not exists (select 1 from pg_roles where rolname = 'anon') then
		create role anon nologin;
	end if;
	if not exists (select 1 from pg_roles where rolname = 'authenticated') then
		create role authenticated nologin;
	end if;
	if not exists (select 1 from pg_roles where rolname = 'service_role') then
		create role service_role nologin bypassrls;
	end if;
end
$shim$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
	grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
	grant all on sequences to anon, authenticated, service_role;
`;

export type TestDb = PGlite & {
	/** Runs `fn` with the session acting as the given role and user. */
	as<T>(role: string, userId: string | null, fn: () => Promise<T>): Promise<T>;
};

export async function createTestDb(options: { seed?: boolean } = {}): Promise<TestDb> {
	const db = (await PGlite.create()) as unknown as TestDb;

	await db.exec(SUPABASE_SHIM);

	const files = (await readdir(MIGRATIONS_DIR))
		.filter((name) => name.endsWith(".sql"))
		.filter((name) => !SKIP_MIGRATIONS.some((pattern) => pattern.test(name)))
		.sort();

	for (const file of files) {
		const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
		try {
			await db.exec(sql);
		} catch (error) {
			throw new Error(`migration ${file} failed: ${(error as Error).message}`);
		}
	}

	// Grants have to come after the tables exist.
	await db.exec(`
		grant select on all tables in schema public to anon, authenticated;
		grant all on all tables in schema public to service_role;
		grant all on all sequences in schema public to service_role;
	`);

	if (options.seed !== false) {
		const seed = await readFile(SEED_FILE, "utf8");
		await db.exec(seed);
	}

	db.as = async function as<T>(
		role: string,
		userId: string | null,
		fn: () => Promise<T>,
	): Promise<T> {
		await db.exec(`set role ${role};`);
		await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
		try {
			return await fn();
		} finally {
			await db.exec("reset role;");
			await db.query("select set_config('request.jwt.claim.sub', '', false)");
		}
	};

	return db;
}

/** Creates a user and makes them the owner. Returns the user id. */
export async function createOwner(db: TestDb, email = "owner@example.com"): Promise<string> {
	const result = await db.query<{ id: string }>(
		"insert into auth.users (email) values ($1) returning id",
		[email],
	);
	const id = result.rows[0]!.id;
	await db.query("insert into admins (user_id) values ($1)", [id]);
	return id;
}

/** The message of the exception a query raised, or null if it succeeded. */
export async function errorOf(fn: () => Promise<unknown>): Promise<string | null> {
	try {
		await fn();
		return null;
	} catch (error) {
		return (error as Error).message;
	}
}
