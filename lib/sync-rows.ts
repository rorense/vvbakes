import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

/**
 * Brings one table's rows for one parent into line with what a form submitted.
 *
 * Four of a product's child tables are saved this way — its extras, its
 * questions, the answers to each question, and its priced combinations — and
 * all four were written out separately, which is four chances to get the order
 * of the statements wrong on the code that can empty a live catalogue.
 *
 * None of them can be replaced wholesale the way bundle prices are, because all
 * four have an identity that outlives the form. A combination's is the one that
 * matters most: `order_items` points at the row it was ordered from, so
 * deleting and re-inserting would hand every combination a new id on every save
 * and quietly cut every past order loose from what it named. Questions and
 * answers are kept for a smaller reason: a combination's link row names them,
 * and churning them would rebuild every link on every save for nothing.
 *
 * So the sequence is always the same three statements, in this order:
 *
 *   1. delete the parent's rows that the form no longer names;
 *   2. upsert the ones that arrived carrying a database id;
 *   3. insert the ones that did not.
 *
 * The delete comes first so that a name freed by a removed row is available to
 * a row taking it — which is what lets two answers swap names in one save.
 * PostgREST has no way to spell "not in the empty set", so clearing the lot and
 * filtering down to the survivors have to be separate calls.
 *
 * Deletes cascade the way the schema says: dropping a question takes its
 * answers and every link to them with it, and dropping a combination takes its
 * links. A basket filled before one of those deletes is refused by
 * `place_order` rather than baked without what it asked for.
 */

type Client = SupabaseClient<Database>;

/** The child tables saved this way. Named, so a typo is a type error. */
export type SyncTable =
	"product_extras" | "product_option_groups" | "product_options" | "product_variants";

export interface SyncRowsOptions {
	supabase: Client;
	table: SyncTable;
	/** The column pointing at the parent: `product_id`, or `group_id` for answers. */
	parentColumn: "product_id" | "group_id";
	parentId: string;
	/**
	 * The rows exactly as they should be written, column names and all, each
	 * with the database id it already has or none if it is new.
	 *
	 * Built by the caller rather than here, because what a row is made of is the
	 * one thing these four tables do not share — and because `sort_order` is not
	 * even counted the same way: extras start at one, everything else at zero.
	 */
	rows: Array<Record<string, unknown> & { id?: string; name: string }>;
	/**
	 * Read the inserted rows back so their new ids can be returned.
	 *
	 * Off for a table nothing points at afterwards, and off is not a detail: an
	 * insert with no `select` asks PostgREST for no representation at all, so
	 * turning this on for a caller that does not need the ids would add a round
	 * trip's worth of rows to every save for nothing.
	 */
	trackIds?: boolean;
	/**
	 * Turns a Postgres error into something the owner can act on. Called for
	 * every failure, so each caller keeps its own wording — "two of those extras
	 * have the same name" is not what a clash between two questions should say.
	 */
	describeError: (message: string) => string;
}

/**
 * Discriminated on `ok` rather than on `error` being present, because a
 * `describeError` is free to return an empty string and a caller testing
 * truthiness would then read a failure as a success.
 */
export type SyncResult =
	| { ok: false; error: string }
	/** One id per submitted row, in the order they were given. Empty unless `trackIds`. */
	| { ok: true; ids: string[] };

export async function syncRows(options: SyncRowsOptions): Promise<SyncResult> {
	const {
		supabase,
		table,
		parentColumn,
		parentId,
		rows,
		trackIds = false,
		describeError,
	} = options;

	// `from(table)` with a variable is the one place this has to shed the
	// generated row types: they describe four different shapes and the whole
	// point here is to be indifferent to which. The table name is still a
	// checked union, and the rows are the caller's own typed objects — what is
	// lost is column-level checking inside this function, which is why nothing
	// in it names a column apart from `id` and the parent's.
	const from = supabase.from(table) as unknown as ReturnType<Client["from"]>;

	const kept = rows.map((row) => row.id).filter((id): id is string => Boolean(id));
	const gone = from.delete().eq(parentColumn, parentId);
	const { error: deleteError } =
		kept.length > 0 ? await gone.not("id", "in", `(${kept.join(",")})`) : await gone;
	if (deleteError) return { ok: false, error: describeError(deleteError.message) };

	const existing = rows.filter((row) => row.id);
	if (existing.length > 0) {
		const { error } = await (supabase.from(table) as never as ReturnType<Client["from"]>).upsert(
			existing,
		);
		if (error) return { ok: false, error: describeError(error.message) };
	}

	const minted = new Map<string, string>();
	const fresh = rows.filter((row) => !row.id).map(({ id: _id, ...row }) => row);
	if (fresh.length > 0) {
		const insert = (supabase.from(table) as never as ReturnType<Client["from"]>).insert(fresh);
		const { data, error } = trackIds ? await insert.select("id, name") : await insert;
		if (error) return { ok: false, error: describeError(error.message) };
		for (const row of (data ?? []) as Array<{ id: string; name: string }>) {
			minted.set(row.name, row.id);
		}
	}

	if (!trackIds) return { ok: true, ids: [] };

	const ids = rows.map((row) => row.id ?? minted.get(row.name));
	// A row that came back without an id means the insert did not return what it
	// was asked for. Nothing downstream can use a half-saved set, so the caller
	// is told rather than handed a list with a hole in it.
	if (ids.some((id) => !id)) return { ok: false, error: describeError("") };

	return { ok: true, ids: ids as string[] };
}
