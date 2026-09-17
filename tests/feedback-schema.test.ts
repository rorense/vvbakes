/**
 * The SQL side of feedback: the one-per-order rule, the lengths, and the
 * boundary that keeps other people's words about her cakes out of reach of a
 * leaked anon key.
 *
 * Runs against real PostgreSQL (see tests/pg.ts). In its own file rather than
 * appended to tests/schema.test.ts, which is the file two workstreams keep
 * landing in at once.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOwner, createTestDb, errorOf, type TestDb } from "./pg";

let db: TestDb;
let ownerId: string;

beforeAll(async () => {
	db = await createTestDb();
	ownerId = await createOwner(db);
}, 120_000);

afterAll(async () => {
	await db?.close();
});

/** An order to hang feedback off, returning its id. */
async function makeOrder(reference: string): Promise<string> {
	const result = await db.query<{ id: string }>(
		`insert into orders (order_number, reference, pickup_date, status,
		                     customer_name, customer_email, customer_phone)
		 values (nextval('order_number_seq'), $1, current_date - 1, 'collected',
		         'Alex Whitiora', 'alex@example.com', '021 555 0100')
		 returning id`,
		[reference],
	);
	return result.rows[0]!.id;
}

beforeEach(async () => {
	await db.query("delete from feedback");
	await db.query("delete from orders");
});

describe("the feedback table", () => {
	it("keeps one answer per order, and a second submission replaces it", async () => {
		const orderId = await makeOrder("VV2001");

		await db.query(
			"insert into feedback (order_id, author, body, consented) values ($1, 'Alex', 'Lovely', true)",
			[orderId],
		);

		// A second insert is the customer coming back to the same link, which is
		// what the action's upsert relies on refusing.
		const message = await errorOf(() =>
			db.query("insert into feedback (order_id, author, body) values ($1, 'Alex', 'Actually…')", [
				orderId,
			]),
		);
		expect(message).toMatch(/duplicate key|unique/i);

		await db.query(
			`insert into feedback (order_id, author, body, consented) values ($1, 'Alex', 'Actually…', false)
			 on conflict (order_id) do update
			 set author = excluded.author, body = excluded.body, consented = excluded.consented`,
			[orderId],
		);

		const rows = await db.query<{ body: string; consented: boolean }>(
			"select body, consented from feedback where order_id = $1",
			[orderId],
		);
		expect(rows.rows).toHaveLength(1);
		expect(rows.rows[0]).toEqual({ body: "Actually…", consented: false });
	});

	it("keeps nothing private by accident: consent is off unless it is given", async () => {
		const orderId = await makeOrder("VV2002");
		await db.query("insert into feedback (order_id, author, body) values ($1, 'Alex', 'Good')", [
			orderId,
		]);

		const rows = await db.query<{ consented: boolean; published_at: string | null }>(
			"select consented, published_at from feedback",
		);
		expect(rows.rows[0]).toEqual({ consented: false, published_at: null });
	});

	it("goes with the order it belongs to", async () => {
		const orderId = await makeOrder("VV2003");
		await db.query("insert into feedback (order_id, author, body) values ($1, 'Alex', 'Good')", [
			orderId,
		]);

		await db.query("delete from orders where id = $1", [orderId]);

		const rows = await db.query("select id from feedback");
		expect(rows.rows).toHaveLength(0);
	});

	it("refuses a name or a body that is empty or too long", async () => {
		const orderId = await makeOrder("VV2004");

		const blankAuthor = await errorOf(() =>
			db.query("insert into feedback (order_id, author, body) values ($1, '   ', 'Good')", [
				orderId,
			]),
		);
		expect(blankAuthor).toMatch(/check constraint/i);

		const blankBody = await errorOf(() =>
			db.query("insert into feedback (order_id, author, body) values ($1, 'Alex', '  ')", [
				orderId,
			]),
		);
		expect(blankBody).toMatch(/check constraint/i);

		// 80 and 800, matching `reviews.author` and `reviews.body`, because that
		// is where these two end up if she publishes them.
		const longAuthor = await errorOf(() =>
			db.query(
				"insert into feedback (order_id, author, body) values ($1, repeat('a', 81), 'Good')",
				[orderId],
			),
		);
		expect(longAuthor).toMatch(/check constraint/i);

		const longBody = await errorOf(() =>
			db.query(
				"insert into feedback (order_id, author, body) values ($1, 'Alex', repeat('b', 801))",
				[orderId],
			),
		);
		expect(longBody).toMatch(/check constraint/i);
	});

	it("records a feedback_received event on the order's trail", async () => {
		const orderId = await makeOrder("VV2005");

		const message = await errorOf(() =>
			db.query(
				"insert into order_events (order_id, type, data) values ($1, 'feedback_received', '{}')",
				[orderId],
			),
		);
		expect(message).toBeNull();
	});
});

describe("who can read feedback", () => {
	it("hides it from anonymous visitors entirely, unlike the reviews", async () => {
		const orderId = await makeOrder("VV2006");
		await db.query(
			"insert into feedback (order_id, author, body, consented) values ($1, 'Alex', 'Lovely', true)",
			[orderId],
		);

		await db.as("anon", null, async () => {
			// Consent is permission to be quoted by her, not a public read. The
			// words only ever reach a visitor by way of a `reviews` row she wrote.
			const rows = await db.query("select author from feedback");
			expect(rows.rows).toHaveLength(0);

			const updated = await db.query("update feedback set body = 'not what they said'");
			expect(updated.affectedRows ?? 0).toBe(0);

			const deleted = await db.query("delete from feedback");
			expect(deleted.affectedRows ?? 0).toBe(0);
		});

		const message = await db.as("anon", null, () =>
			errorOf(() =>
				db.query(
					"insert into feedback (order_id, author, body) values ($1, 'Mallory', 'Five stars, allegedly')",
					[orderId],
				),
			),
		);
		expect(message).toMatch(/row-level security|permission denied/i);
	});

	it("lets the owner read it, publish it and throw it away", async () => {
		const orderId = await makeOrder("VV2007");
		await db.query(
			"insert into feedback (order_id, author, body, consented) values ($1, 'Alex', 'Lovely', true)",
			[orderId],
		);

		await db.as("authenticated", ownerId, async () => {
			const rows = await db.query("select author from feedback");
			expect(rows.rows).toHaveLength(1);

			const stamped = await db.query("update feedback set published_at = now()");
			expect(stamped.affectedRows ?? 0).toBe(1);

			const deleted = await db.query("delete from feedback");
			expect(deleted.affectedRows ?? 0).toBe(1);
		});
	});

	it("gives a signed-in stranger nothing", async () => {
		const orderId = await makeOrder("VV2008");
		await db.query("insert into feedback (order_id, author, body) values ($1, 'Alex', 'Lovely')", [
			orderId,
		]);

		const stranger = await db.query<{ id: string }>(
			"insert into auth.users (email) values ('nosy@example.com') returning id",
		);

		await db.as("authenticated", stranger.rows[0]!.id, async () => {
			const rows = await db.query("select author from feedback");
			expect(rows.rows).toHaveLength(0);
		});
	});
});
