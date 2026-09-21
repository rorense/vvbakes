/**
 * The SQL side of the star ratings: the one-per-product rule, the 1-to-5
 * bound, what happens to a rating when its product or its feedback goes, and
 * the boundary that lets anon read an average without reading a single row.
 *
 * That last one is the point of the whole arrangement. A row here is (which
 * order, which cake, what they thought), and at this shop's size that is close
 * to naming the customer; the average and the count are what the Product
 * markup publishes, so they are all that may come out.
 *
 * Runs against real PostgreSQL (see tests/pg.ts). In its own file rather than
 * appended to tests/schema.test.ts, for the reason written in
 * tests/feedback-schema.test.ts.
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

async function makeFeedback(reference: string): Promise<string> {
	const orderId = await makeOrder(reference);
	const result = await db.query<{ id: string }>(
		`insert into feedback (order_id, author, body, consented)
		 values ($1, 'Alex', 'Lovely', false) returning id`,
		[orderId],
	);
	return result.rows[0]!.id;
}

async function makeProduct(slug: string): Promise<string> {
	const result = await db.query<{ id: string }>(
		`insert into products (name, slug, unit_price_cents, unit_label)
		 values ($1, $2, 500, 'each') returning id`,
		[slug, slug],
	);
	return result.rows[0]!.id;
}

beforeEach(async () => {
	await db.query("delete from feedback_ratings");
	await db.query("delete from feedback");
	await db.query("delete from orders");
	await db.query("delete from products");
});

describe("the feedback_ratings table", () => {
	it("keeps one rating per product per order", async () => {
		const feedbackId = await makeFeedback("VV3001");
		const productId = await makeProduct("cupcakes");

		await db.query(
			"insert into feedback_ratings (feedback_id, product_id, rating) values ($1, $2, 4)",
			[feedbackId, productId],
		);

		// Two lines of the same cake in different flavours is still one opinion
		// of that cake, and must not count twice towards its average.
		const message = await errorOf(() =>
			db.query(
				"insert into feedback_ratings (feedback_id, product_id, rating) values ($1, $2, 2)",
				[feedbackId, productId],
			),
		);
		expect(message).toMatch(/duplicate key|unique/i);
	});

	it("refuses a rating outside one to five", async () => {
		const feedbackId = await makeFeedback("VV3002");
		const productId = await makeProduct("cookies");

		for (const rating of [0, 6, -1]) {
			const message = await errorOf(() =>
				db.query(
					"insert into feedback_ratings (feedback_id, product_id, rating) values ($1, $2, $3)",
					[feedbackId, productId, rating],
				),
			);
			expect(message).toMatch(/check|constraint/i);
		}
	});

	it("takes the rating away with the feedback it came from", async () => {
		const feedbackId = await makeFeedback("VV3003");
		const productId = await makeProduct("brownies");
		await db.query(
			"insert into feedback_ratings (feedback_id, product_id, rating) values ($1, $2, 5)",
			[feedbackId, productId],
		);

		await db.query("delete from feedback where id = $1", [feedbackId]);

		const left = await db.query("select id from feedback_ratings");
		expect(left.rows).toHaveLength(0);
	});

	it("takes the rating away with the product it was about", async () => {
		// The opposite of order_items.product_id, which nulls: an order line has
		// to go on describing what was bought, a rating has nothing left to be
		// an average of.
		const feedbackId = await makeFeedback("VV3004");
		const productId = await makeProduct("wingko");
		await db.query(
			"insert into feedback_ratings (feedback_id, product_id, rating) values ($1, $2, 5)",
			[feedbackId, productId],
		);

		await db.query("delete from products where id = $1", [productId]);

		const left = await db.query("select id from feedback_ratings");
		expect(left.rows).toHaveLength(0);
	});
});

describe("coming back to the link a second time", () => {
	/**
	 * What `submitFeedback` does with the stars: delete every rating on this
	 * feedback, then insert whatever came in. Merging would be wrong, and these
	 * cover why.
	 *
	 * Worth having as SQL rather than only in the action, because the action
	 * cannot be driven without a real order in `collected` or `ready`, and
	 * production had none on 2026-09-22. This is the contract underneath it.
	 */
	async function replaceRatings(feedbackId: string, ratings: Array<[string, number]>) {
		await db.query("delete from feedback_ratings where feedback_id = $1", [feedbackId]);
		for (const [productId, rating] of ratings) {
			await db.query(
				"insert into feedback_ratings (feedback_id, product_id, rating) values ($1, $2, $3)",
				[feedbackId, productId, rating],
			);
		}
	}

	it("overwrites a rating they changed their mind about", async () => {
		const feedbackId = await makeFeedback("VV3040");
		const productId = await makeProduct("cupcakes");

		await replaceRatings(feedbackId, [[productId, 5]]);
		await replaceRatings(feedbackId, [[productId, 2]]);

		const rows = await db.query<{ rating: number }>("select rating from feedback_ratings");
		expect(rows.rows).toHaveLength(1);
		expect(rows.rows[0]!.rating).toBe(2);

		// And the average follows, rather than sitting between the two answers.
		const summary = await db.query<{ rating_average: string; rating_count: number }>(
			"select rating_average, rating_count from product_rating_summary()",
		);
		expect(summary.rows[0]!.rating_count).toBe(1);
		expect(Number(summary.rows[0]!.rating_average)).toBe(2);
	});

	it("lets a rating they cleared disappear entirely", async () => {
		// The form's Clear button sends nothing for that product, so the second
		// pass carries one rating where the first carried two. A merge would
		// leave the cleared star behind, which is an opinion they withdrew.
		const feedbackId = await makeFeedback("VV3041");
		const kept = await makeProduct("cookies");
		const cleared = await makeProduct("brownies");

		await replaceRatings(feedbackId, [
			[kept, 4],
			[cleared, 1],
		]);
		await replaceRatings(feedbackId, [[kept, 4]]);

		const rows = await db.query<{ product_id: string }>("select product_id from feedback_ratings");
		expect(rows.rows).toHaveLength(1);
		expect(rows.rows[0]!.product_id).toBe(kept);

		// The cleared product drops out of the summary rather than keeping a 1.
		const summary = await db.query<{ product_id: string }>(
			"select product_id from product_rating_summary()",
		);
		expect(summary.rows.map((r) => r.product_id)).toEqual([kept]);
	});

	it("leaves another order's ratings alone", async () => {
		// The delete is scoped to one feedback row. If it were not, one customer
		// revising their answer would wipe everybody else's.
		const mine = await makeFeedback("VV3042");
		const theirs = await makeFeedback("VV3043");
		const productId = await makeProduct("tiramisu");

		await replaceRatings(theirs, [[productId, 5]]);
		await replaceRatings(mine, [[productId, 3]]);
		await replaceRatings(mine, [[productId, 1]]);

		const summary = await db.query<{ rating_count: number; rating_average: string }>(
			"select rating_count, rating_average from product_rating_summary()",
		);
		expect(summary.rows[0]!.rating_count).toBe(2);
		expect(Number(summary.rows[0]!.rating_average)).toBe(3);
	});
});

describe("product_rating_summary", () => {
	it("averages every rating a product has, across orders", async () => {
		const productId = await makeProduct("cupcakes");
		const first = await makeFeedback("VV3010");
		const second = await makeFeedback("VV3011");
		const third = await makeFeedback("VV3012");

		for (const [feedbackId, rating] of [
			[first, 5],
			[second, 4],
			[third, 5],
		] as const) {
			await db.query(
				"insert into feedback_ratings (feedback_id, product_id, rating) values ($1, $2, $3)",
				[feedbackId, productId, rating],
			);
		}

		const rows = await db.query<{
			product_id: string;
			rating_count: number;
			rating_average: string;
		}>("select * from product_rating_summary()");

		expect(rows.rows).toHaveLength(1);
		expect(rows.rows[0]!.product_id).toBe(productId);
		expect(rows.rows[0]!.rating_count).toBe(3);
		expect(Number(rows.rows[0]!.rating_average)).toBeCloseTo(4.67, 2);
	});

	it("counts ratings whose feedback was never published", async () => {
		// The consent box governs quoting somebody's words under their name. A
		// number folded into an average is neither, and an average of only the
		// reviews she chose to publish would be a rating of her publishing
		// decisions rather than of the cake.
		const productId = await makeProduct("tiramisu");
		const feedbackId = await makeFeedback("VV3020");
		await db.query(
			"insert into feedback_ratings (feedback_id, product_id, rating) values ($1, $2, 3)",
			[feedbackId, productId],
		);

		const published = await db.query<{ published_at: string | null }>(
			"select published_at from feedback where id = $1",
			[feedbackId],
		);
		expect(published.rows[0]!.published_at).toBeNull();

		const rows = await db.query<{ rating_count: number }>(
			"select rating_count from product_rating_summary()",
		);
		expect(rows.rows[0]!.rating_count).toBe(1);
	});

	it("returns nothing at all before anybody has rated anything", async () => {
		const rows = await db.query("select * from product_rating_summary()");
		expect(rows.rows).toHaveLength(0);
	});
});

describe("the boundary around the ratings", () => {
	it("gives anon the average but never a row", async () => {
		const productId = await makeProduct("pandan");
		const feedbackId = await makeFeedback("VV3030");
		await db.query(
			"insert into feedback_ratings (feedback_id, product_id, rating) values ($1, $2, 2)",
			[feedbackId, productId],
		);

		await db.as("anon", null, async () => {
			// The table itself is closed, the same as `feedback` next to it.
			const rows = await db.query("select rating from feedback_ratings");
			expect(rows.rows).toHaveLength(0);

			// The aggregate is not. This is the one thing anon may learn, and it
			// is what the Product markup publishes.
			const summary = await db.query<{ rating_count: number }>(
				"select rating_count from product_rating_summary()",
			);
			expect(summary.rows[0]!.rating_count).toBe(1);
		});
	});

	it("gives a signed-in stranger nothing", async () => {
		const productId = await makeProduct("brochi");
		const feedbackId = await makeFeedback("VV3031");
		await db.query(
			"insert into feedback_ratings (feedback_id, product_id, rating) values ($1, $2, 4)",
			[feedbackId, productId],
		);

		const stranger = await db.query<{ id: string }>(
			"insert into auth.users (email) values ('nosy-ratings@example.com') returning id",
		);

		await db.as("authenticated", stranger.rows[0]!.id, async () => {
			const rows = await db.query("select rating from feedback_ratings");
			expect(rows.rows).toHaveLength(0);
		});
	});

	it("lets the owner read them", async () => {
		const productId = await makeProduct("charlotte");
		const feedbackId = await makeFeedback("VV3032");
		await db.query(
			"insert into feedback_ratings (feedback_id, product_id, rating) values ($1, $2, 4)",
			[feedbackId, productId],
		);

		await db.as("authenticated", ownerId, async () => {
			const rows = await db.query<{ rating: number }>("select rating from feedback_ratings");
			expect(rows.rows).toHaveLength(1);
			expect(rows.rows[0]!.rating).toBe(4);
		});
	});
});
