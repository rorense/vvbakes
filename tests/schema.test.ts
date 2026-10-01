/**
 * Exercises the SQL that customer orders actually depend on: bundle pricing,
 * capacity, lead time and cut-off, and the row level security boundary.
 *
 * These run against real PostgreSQL (see tests/pg.ts), so a syntax error or a
 * policy mistake fails here rather than in production.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOwner, createTestDb, errorOf, type TestDb } from "./pg";

let db: TestDb;

beforeAll(async () => {
	db = await createTestDb();
}, 120_000);

afterAll(async () => {
	await db?.close();
});

async function productId(slug: string): Promise<string> {
	const result = await db.query<{ id: string }>("select id from products where slug = $1", [slug]);
	return result.rows[0]!.id;
}

async function price(slug: string, qty: number) {
	const id = await productId(slug);
	const result = await db.query<{ total_cents: number; note: string }>(
		"select total_cents, note from price_for_qty($1, $2)",
		[id, qty],
	);
	return result.rows[0]!;
}

/** Opens every day for the next 60 days with the given capacity. */
async function openEveryDay(capacity: number) {
	await db.query("update availability_rules set is_open = true, capacity = $1", [capacity]);
	await db.query("delete from availability_overrides");
}

/** A date `days` from now, as YYYY-MM-DD in the business timezone. */
async function dateIn(days: number): Promise<string> {
	const result = await db.query<{ d: string }>(
		`select to_char(
			((now() at time zone (select timezone from site_settings where id = 1))::date + $1::int),
			'YYYY-MM-DD'
		) as d`,
		[days],
	);
	return result.rows[0]!.d;
}

type PlaceArgs = {
	items: Array<{
		product_id: string;
		variant_id?: string;
		qty: number;
		/** The shape sent before an extra could be had more than once. */
		extra_ids?: string[];
		/** And the shape sent now: each extra with how many of it. */
		extras?: Array<{ id: string; qty?: number | string }>;
		/** The brief this line carries, since the custom cake became a product. */
		note?: string;
		inspiration_url?: string;
		inspiration_image_paths?: string[];
		/** And the flavour of their own, on the products that ask for one. */
		custom_flavour?: string;
		frosting?: string;
		frosting_matches_flavour?: boolean;
	}>;
	pickupDate: string;
	/** Roughly when they hope to collect. Absent on most orders, and fine. */
	pickupTime?: string | null;
	fulfilment?: "pickup" | "delivery";
	name?: string;
	email?: string;
	phone?: string;
	address?: string | null;
	notes?: string | null;
	custom?: string | null;
	ipHash?: string | null;
	photos?: string[];
	inspirationUrl?: string | null;
};

async function placeOrder(args: PlaceArgs) {
	const result = await db.query<{
		id: string;
		token: string;
		reference: string;
		total_cents: number;
	}>("select * from place_order($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)", [
		JSON.stringify(args.items),
		args.pickupDate,
		args.fulfilment ?? "pickup",
		args.name ?? "Test Customer",
		args.email ?? "Test@Example.com ",
		args.phone ?? "021 555 0100",
		args.address ?? null,
		args.notes ?? null,
		args.custom ?? null,
		args.ipHash ?? null,
		args.photos ?? [],
		args.inspirationUrl ?? null,
		args.pickupTime ?? null,
	]);
	return result.rows[0]!;
}

describe("seed data", () => {
	it("transcribes the market menu exactly", async () => {
		const result = await db.query<{
			slug: string;
			unit_price_cents: number;
			unit_label: string;
			qty_step: number;
		}>("select slug, unit_price_cents, unit_label, qty_step from products order by sort_order");

		expect(result.rows).toEqual([
			// Not off the market menu at all: this is the custom cake, seeded with
			// no price because there is none until she has seen the brief. It leads
			// the list because it is the thing she mostly makes.
			{
				slug: "custom-cake",
				unit_price_cents: 0,
				unit_label: "cake",
				qty_step: 1,
			},
			{
				slug: "cupcakes",
				unit_price_cents: 300,
				unit_label: "each",
				qty_step: 1,
			},
			{
				slug: "cookies",
				unit_price_cents: 500,
				unit_label: "pack",
				qty_step: 1,
			},
			{
				slug: "brochi",
				unit_price_cents: 500,
				unit_label: "slice",
				qty_step: 1,
			},
			{
				slug: "wingko",
				unit_price_cents: 500,
				unit_label: "slice",
				qty_step: 1,
			},
			{
				slug: "pandan-chiffon-cake",
				unit_price_cents: 300,
				unit_label: "slice",
				qty_step: 1,
			},
			// Last, and the only one not priced by the unit alone: $17.50 a box of
			// twelve for the first two, $15 a box after that. The two columns that
			// say so are checked in their own test below rather than widened into
			// this one, which is about the transcription.
			{
				slug: "cupcakes-mini-sized",
				unit_price_cents: 1750,
				unit_label: "box of 12",
				qty_step: 1,
			},
		]);
	});

	it("seeds the minis with a minimum and a lower rate past it", async () => {
		const result = await db.query<{
			min_per_order: number | null;
			extra_unit_price_cents: number | null;
			inspiration_hint: string | null;
		}>(
			`select min_per_order, extra_unit_price_cents, inspiration_hint
			 from products where slug = 'cupcakes-mini-sized'`,
		);
		expect(result.rows[0]!.min_per_order).toBe(2);
		expect(result.rows[0]!.extra_unit_price_cents).toBe(1500);
		// Not the default wording, which talks about a cake.
		expect(result.rows[0]!.inspiration_hint).toContain("Cupcakes");

		// The numbers off her menu, priced by the database rather than asserted
		// against the row: two boxes $35, then $15 a box, and no rung it stops at.
		const ids = await db.query<{ id: string }>(
			"select id from products where slug = 'cupcakes-mini-sized'",
		);
		const productId = ids.rows[0]!.id;
		for (const [qty, cents] of [
			[2, 3500],
			[3, 5000],
			[4, 6500],
			[5, 8000],
			[6, 9500],
			[20, 3500 + 1500 * 18],
		] as const) {
			const priced = await db.query<{ total_cents: number }>(
				"select total_cents from price_for_qty($1, $2)",
				[productId, qty],
			);
			expect([qty, priced.rows[0]!.total_cents]).toEqual([qty, cents]);
		}
	});

	it("creates exactly seven weekday rules", async () => {
		const result = await db.query<{ count: number }>(
			"select count(*)::int as count from availability_rules",
		);
		expect(result.rows[0]!.count).toBe(7);
	});

	it("leaves bank details empty, they are entered in the admin, never committed", async () => {
		const result = await db.query<{
			bank_account_number: string | null;
			pickup_address: string | null;
		}>("select bank_account_number, pickup_address from site_settings_private where id = 1");
		expect(result.rows[0]!.bank_account_number).toBeNull();
		expect(result.rows[0]!.pickup_address).toBeNull();
	});

	it("starts the home page off with five questions, in order", async () => {
		const result = await db.query<{ question: string; sort_order: number }>(
			"select question, sort_order from faqs order by sort_order",
		);
		expect(result.rows.map((row) => row.sort_order)).toEqual([1, 2, 3, 4, 5]);
		expect(result.rows[0]!.question).toBe("How much notice do you need?");
	});

	it("ships no reviews at all", async () => {
		// Deliberate, and worth a test so that a later "helpful" seed has to argue
		// with this line first: a placeholder review is a sentence attributed to
		// someone who never said it, on a real bakery's public page.
		const result = await db.query<{ count: number }>("select count(*)::int as count from reviews");
		expect(result.rows[0]!.count).toBe(0);
	});

	it("asks for a note on everything except the chiffon, which comes how it comes", async () => {
		const result = await db.query<{ slug: string; wants_note: boolean }>(
			"select slug, wants_note from products order by slug",
		);

		// The column defaults true and 20260918000001 turns exactly one row off,
		// which is the whole of what that migration does to seeded data. A second
		// product going quiet is a migration that matched more slugs than it meant
		// to, and this is where that shows up.
		expect(result.rows.filter((row) => !row.wants_note).map((row) => row.slug)).toEqual([
			"pandan-chiffon-cake",
		]);
	});

	it("leaves the note's wording to the code, bar the examples she asked for", async () => {
		const result = await db.query<{
			slug: string;
			note_hint: string | null;
			note_placeholder: string | null;
		}>("select slug, note_hint, note_placeholder from products order by slug");

		// Null means "say what BriefFields says". Seeding a hint would be a
		// second copy of that wording, in a place nobody rewording it would
		// think to look, so a later "helpful" seed has to argue with this line.
		expect(result.rows.filter((row) => row.note_hint !== null).map((row) => row.slug)).toEqual([]);

		// The example is the one piece of wording seeded, and only where she
		// asked for it: the two sold by the slice, the cookies and the two kinds
		// of cupcake, which is what 20260918000002, 20260918000004 and
		// 20260918000009 put on an install that already has them. A sixth slug
		// here is a copy of the default in a place it should not be.
		const CUPCAKE_EXAMPLE =
			"E.g. Cupcakes are for a gender reveal party, make half the order with pastel pink coloured vanilla buttercream, and the other half with pastel blue coloured vanilla buttercream in a rosette design as shown in the inspo picture.";

		expect(
			result.rows
				.filter((row) => row.note_placeholder !== null)
				.map((row) => [row.slug, row.note_placeholder]),
		).toEqual([
			["brochi", "E.g. Can each slice be cut in half?"],
			["cookies", "E.g. Please don't add any flaky salt"],
			["cupcakes", CUPCAKE_EXAMPLE],
			["cupcakes-mini-sized", CUPCAKE_EXAMPLE],
			["wingko", "E.g. Can each slice be cut in half?"],
		]);
	});

	/**
	 * The photo picker's line, which only the cupcakes reword.
	 *
	 * Checked apart from the note above because it is a different question with a
	 * different default: the note box is offered on everything, while the picker
	 * is only drawn where `wants_brief` is on, so a hint on a product that never
	 * shows it is wording nobody will ever read.
	 */
	it("rewords the photo picker for the cupcakes and nothing else", async () => {
		const result = await db.query<{
			slug: string;
			wants_brief: boolean;
			inspiration_hint: string | null;
		}>("select slug, wants_brief, inspiration_hint from products order by slug");

		const reworded = result.rows.filter((row) => row.inspiration_hint !== null);

		expect(reworded.map((row) => row.slug)).toEqual(["cupcakes", "cupcakes-mini-sized"]);

		// Every one of them asks for photos, or the wording is unreachable.
		expect(reworded.every((row) => row.wants_brief)).toBe(true);

		// The default's first three words are the whole of the change, and the
		// rest has to survive: "be specific in the notes" is the part she cares
		// about and the part a careless reword would drop.
		for (const row of reworded) {
			expect(row.inspiration_hint).toMatch(/^Cupcakes you've seen and loved/);
			expect(row.inspiration_hint).toContain("be specific in the notes section");
			expect(row.inspiration_hint).not.toContain("A cake");
		}
	});

	it("is idempotent", async () => {
		const seed = await import("node:fs/promises").then((fs) =>
			fs.readFile("supabase/seed.sql", "utf8"),
		);
		await db.exec(seed);
		const result = await db.query<{ count: number }>("select count(*)::int as count from products");
		// The five off the market menu, plus the custom cake that a later
		// migration adds and the minis the seed adds in a second insert.
		// Re-running the seed must not duplicate any of the three sets.
		expect(result.rows[0]!.count).toBe(7);
	});

	it("calls the cupcakes cupcakes in their own questions, and nothing else", async () => {
		const result = await db.query<{ slug: string; brief_noun: string | null }>(
			"select slug, brief_noun from products order by slug",
		);
		const named = result.rows.filter((row) => row.brief_noun !== null);

		// Only the two kinds of cupcake. Null everywhere else says "cake", which
		// is what all three sentences said before there was a choice and is right
		// on the custom cake they were written for.
		expect(named.map((row) => [row.slug, row.brief_noun])).toEqual([
			["cupcakes", "cupcake"],
			["cupcakes-mini-sized", "cupcake"],
		]);
	});

	it("offers the minis as several flavours at once, and nothing else", async () => {
		const result = await db.query<{ slug: string }>(
			"select slug from products where mix_variants order by slug",
		);
		// Only the minis. The chiffon and the tiramisu sell sizes, which are the
		// same shape in this table and are not a thing anyone mixes, so a second
		// slug here means the switch was set from the data rather than by her.
		expect(result.rows.map((row) => row.slug)).toEqual(["cupcakes-mini-sized"]);
	});
});

describe("price_for_qty", () => {
	it("prices a single cupcake at the unit price", async () => {
		expect(await price("cupcakes", 1)).toEqual({
			total_cents: 300,
			note: "1 x $3.00 each",
		});
	});

	it("uses the 4 for $12 bundle at exactly four", async () => {
		expect(await price("cupcakes", 4)).toEqual({
			total_cents: 1200,
			note: "1 x 4 for $12.00",
		});
	});

	it("mixes a bundle with singles for five", async () => {
		expect(await price("cupcakes", 5)).toEqual({
			total_cents: 1500,
			note: "1 x 4 for $12.00 + 1 x $3.00 each",
		});
	});

	it("stacks bundles for nine", async () => {
		expect(await price("cupcakes", 9)).toEqual({
			total_cents: 2700,
			note: "2 x 4 for $12.00 + 1 x $3.00 each",
		});
	});

	it("prices cookies by the pack", async () => {
		expect((await price("cookies", 1)).total_cents).toBe(500);
		expect((await price("cookies", 3)).total_cents).toBe(1500);
	});

	it("picks the cheapest combination, not the largest bundle", async () => {
		// A greedy "biggest bundle first" implementation charges $18 for six of
		// these: one 4-pack ($12) plus two singles ($6). Two 3-packs cost $16.
		const id = await productId("brochi");
		await db.query("update products set unit_price_cents = 300 where id = $1", [id]);
		await db.query(
			`insert into product_price_tiers (product_id, qty, price_cents)
			 values ($1, 4, 1200), ($1, 3, 800)
			 on conflict (product_id, qty) do update set price_cents = excluded.price_cents`,
			[id],
		);

		const result = await price("brochi", 6);
		expect(result.total_cents).toBe(1600);
		expect(result.note).toBe("2 x 3 for $8.00");

		await db.query("delete from product_price_tiers where product_id = $1", [id]);
		await db.query("update products set unit_price_cents = 500 where id = $1", [id]);
	});

	it("rejects a quantity below one", async () => {
		const id = await productId("cupcakes");
		const message = await errorOf(() => db.query("select * from price_for_qty($1, 0)", [id]));
		expect(message).toContain("QTY_INVALID");
	});
});

describe("place_order", () => {
	beforeAll(async () => {
		await openEveryDay(50);
	});

	it("totals a mixed order and snapshots each line", async () => {
		const order = await placeOrder({
			items: [
				{ product_id: await productId("cupcakes"), qty: 5 },
				{ product_id: await productId("cookies"), qty: 2 },
			],
			pickupDate: await dateIn(7),
		});

		expect(order.total_cents).toBe(2500);
		expect(order.reference).toMatch(/^VV\d+$/);
		expect(order.token).toMatch(/^[0-9a-f]{32}$/);

		const items = await db.query<{
			product_name: string;
			qty: number;
			line_total_cents: number;
			pricing_note: string;
		}>(
			`select product_name, qty, line_total_cents, pricing_note
			 from order_items where order_id = $1 order by product_name`,
			[order.id],
		);

		expect(items.rows).toEqual([
			{
				product_name: "Cookies",
				qty: 2,
				line_total_cents: 1000,
				pricing_note: "2 x $5.00 pack",
			},
			{
				product_name: "Cupcakes",
				qty: 5,
				line_total_cents: 1500,
				pricing_note: "1 x 4 for $12.00 + 1 x $3.00 each",
			},
		]);
	});

	it("normalises the customer's email and records a created event", async () => {
		const order = await placeOrder({
			items: [{ product_id: await productId("brochi"), qty: 1 }],
			pickupDate: await dateIn(7),
			email: "  MiXeD@Example.COM  ",
		});

		const row = await db.query<{ customer_email: string }>(
			"select customer_email from orders where id = $1",
			[order.id],
		);
		expect(row.rows[0]!.customer_email).toBe("mixed@example.com");

		const events = await db.query<{ type: string }>(
			"select type from order_events where order_id = $1",
			[order.id],
		);
		expect(events.rows.map((e) => e.type)).toEqual(["created"]);
	});

	it("keeps the time they asked for, cut to the minute", async () => {
		const order = await placeOrder({
			items: [{ product_id: await productId("brochi"), qty: 1 }],
			pickupDate: await dateIn(7),
			pickupTime: "16:30:45",
		});

		const row = await db.query<{ pickup_time: string }>(
			"select pickup_time::text from orders where id = $1",
			[order.id],
		);
		// The seconds go. A collection time to the second is not a thing anybody
		// meant, and storing one would make a preference look like an appointment.
		expect(row.rows[0]!.pickup_time).toBe("16:30:00");
	});

	it("takes an order from someone who never said a time", async () => {
		const order = await placeOrder({
			items: [{ product_id: await productId("brochi"), qty: 1 }],
			pickupDate: await dateIn(7),
		});

		const row = await db.query<{ pickup_time: string | null }>(
			"select pickup_time::text from orders where id = $1",
			[order.id],
		);
		expect(row.rows[0]!.pickup_time).toBeNull();
	});

	it("merges duplicate lines for the same product", async () => {
		const cupcakes = await productId("cupcakes");
		const order = await placeOrder({
			items: [
				{ product_id: cupcakes, qty: 2 },
				{ product_id: cupcakes, qty: 2 },
			],
			pickupDate: await dateIn(7),
		});

		const items = await db.query<{ qty: number; line_total_cents: number }>(
			"select qty, line_total_cents from order_items where order_id = $1",
			[order.id],
		);
		expect(items.rows).toEqual([{ qty: 4, line_total_cents: 1200 }]);
	});

	it("enforces min_per_order across split lines", async () => {
		const cupcakes = await productId("cupcakes");
		await db.query("update products set min_per_order = 6 where id = $1", [cupcakes]);

		const date = await dateIn(7);
		const message = await errorOf(async () =>
			placeOrder({
				items: [
					{ product_id: cupcakes, qty: 2 },
					{ product_id: cupcakes, qty: 2 },
				],
				pickupDate: date,
			}),
		);
		expect(message).toContain("QTY_BELOW_MINIMUM");

		// The other half of the same rule: two lines that only reach the
		// minimum together are a real order and have to go through.
		const order = await placeOrder({
			items: [
				{ product_id: cupcakes, qty: 3 },
				{ product_id: cupcakes, qty: 3 },
			],
			pickupDate: date,
		});
		expect(order.reference).toMatch(/^VV/);

		await db.query("update products set min_per_order = null where id = $1", [cupcakes]);
	});

	it("rejects a quantity that does not match the product's step", async () => {
		// Nothing in the seed is stepped now that cookies are sold by the pack,
		// so borrow a product and put it back afterwards.
		const id = await productId("brochi");
		await db.query("update products set qty_step = 2 where id = $1", [id]);

		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: id, qty: 3 }],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("QTY_INVALID");

		await db.query("update products set qty_step = 1 where id = $1", [id]);
	});

	it("rejects an unavailable product", async () => {
		const wingko = await productId("wingko");
		await db.query("update products set is_available = false where id = $1", [wingko]);

		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: wingko, qty: 1 }],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("PRODUCT_UNAVAILABLE");

		await db.query("update products set is_available = true where id = $1", [wingko]);
	});

	it("rejects an order that is neither items nor a request", async () => {
		const message = await errorOf(async () =>
			placeOrder({ items: [], pickupDate: await dateIn(7) }),
		);
		expect(message).toContain("EMPTY_ORDER");
	});

	it("accepts a custom cake with nothing off the menu", async () => {
		// The whole point: someone wanting a birthday cake has nothing to put in
		// a basket, and used to be turned away.
		const order = await placeOrder({
			items: [],
			pickupDate: await dateIn(7),
			custom: "30th birthday, about 12 people, chocolate, not too sweet.",
		});

		expect(order.reference).toMatch(/^VV\d+$/);
		// No price yet. Nobody can quote a cake before hearing about it.
		expect(order.total_cents).toBe(0);

		const row = await db.query<{ custom_request: string; quote_cents: number }>(
			"select custom_request, quote_cents from orders where id = $1",
			[order.id],
		);
		expect(row.rows[0]!.custom_request).toContain("30th birthday");
		expect(row.rows[0]!.quote_cents).toBe(0);

		const items = await db.query("select id from order_items where order_id = $1", [order.id]);
		expect(items.rows).toHaveLength(0);
	});

	it("treats a request of only whitespace as nothing at all", async () => {
		const message = await errorOf(async () =>
			placeOrder({ items: [], pickupDate: await dateIn(7), custom: "   \n  " }),
		);
		expect(message).toContain("EMPTY_ORDER");
	});

	it("lets a custom cake sit alongside things off the menu", async () => {
		const order = await placeOrder({
			items: [{ product_id: await productId("cookies"), qty: 2 }],
			pickupDate: await dateIn(7),
			custom: "And a small cake to go with them.",
		});
		expect(order.total_cents).toBe(1000);
	});

	it("counts a custom cake against the day's capacity like any other order", async () => {
		// A custom cake takes a day's work whether or not anything was bought
		// off the menu, so it has to occupy a slot.
		const date = await dateIn(11);
		await db.query(
			"insert into availability_overrides (date, is_open, capacity) values ($1, true, 1)",
			[date],
		);

		const first = await errorOf(() =>
			placeOrder({ items: [], pickupDate: date, custom: "A cake please" }),
		);
		expect(first).toBeNull();

		const second = await errorOf(() =>
			placeOrder({ items: [], pickupDate: date, custom: "Another cake please" }),
		);
		expect(second).toContain("DATE_FULL");

		await db.query("delete from availability_overrides where date = $1", [date]);
	});

	it("keeps the photos and the link the customer sent", async () => {
		const order = await placeOrder({
			items: [],
			pickupDate: await dateIn(7),
			custom: "Like this one, but lemon.",
			photos: ["2026-09-11/abc.webp", "2026-09-11/def.webp"],
			inspirationUrl: "https://www.pinterest.com/pin/12345/",
		});

		const row = await db.query<{
			inspiration_image_paths: string[];
			inspiration_url: string;
		}>("select inspiration_image_paths, inspiration_url from orders where id = $1", [order.id]);

		expect(row.rows[0]!.inspiration_image_paths).toEqual([
			"2026-09-11/abc.webp",
			"2026-09-11/def.webp",
		]);
		expect(row.rows[0]!.inspiration_url).toBe("https://www.pinterest.com/pin/12345/");
	});

	it("accepts a picture as the whole brief, with no words at all", async () => {
		// Plenty of people have the cake saved on their phone and nothing to add
		// about it. That is a complete request, not an empty order.
		const order = await placeOrder({
			items: [],
			pickupDate: await dateIn(7),
			photos: ["2026-09-11/only.webp"],
		});
		expect(order.reference).toMatch(/^VV\d+$/);
	});

	it("accepts a link as the whole brief too", async () => {
		const order = await placeOrder({
			items: [],
			pickupDate: await dateIn(7),
			inspirationUrl: "https://www.instagram.com/p/abc/",
		});
		expect(order.reference).toMatch(/^VV\d+$/);
	});

	it("drops blank paths and keeps at most three photos", async () => {
		const order = await placeOrder({
			items: [],
			pickupDate: await dateIn(7),
			custom: "A cake",
			photos: ["a.webp", "   ", "b.webp", "c.webp", "d.webp"],
		});

		const row = await db.query<{ inspiration_image_paths: string[] }>(
			"select inspiration_image_paths from orders where id = $1",
			[order.id],
		);
		expect(row.rows[0]!.inspiration_image_paths).toEqual(["a.webp", "b.webp", "c.webp"]);
	});

	it("refuses a fourth photo written straight into the row", async () => {
		const order = await placeOrder({
			items: [],
			pickupDate: await dateIn(7),
			custom: "A cake",
		});
		const message = await errorOf(() =>
			db.query("update orders set inspiration_image_paths = $1 where id = $2", [
				["a.webp", "b.webp", "c.webp", "d.webp"],
				order.id,
			]),
		);
		expect(message).toMatch(/inspiration_image_paths/);
	});

	it("leaves an order with no pictures holding an empty array, never null", async () => {
		const order = await placeOrder({
			items: [],
			pickupDate: await dateIn(7),
			custom: "Just words.",
		});
		const row = await db.query<{ inspiration_image_paths: string[]; inspiration_url: null }>(
			"select inspiration_image_paths, inspiration_url from orders where id = $1",
			[order.id],
		);
		expect(row.rows[0]!.inspiration_image_paths).toEqual([]);
		expect(row.rows[0]!.inspiration_url).toBeNull();
	});

	it("records whether an order was a custom request", async () => {
		const order = await placeOrder({
			items: [],
			pickupDate: await dateIn(7),
			custom: "Something with lemon.",
		});
		const events = await db.query<{ data: { custom: boolean } }>(
			"select data from order_events where order_id = $1 and type = 'created'",
			[order.id],
		);
		expect(events.rows[0]!.data.custom).toBe(true);
	});

	it("refuses dates inside the lead time", async () => {
		// Seeded lead time is 2 days, so tomorrow is always too soon.
		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: await productId("brochi"), qty: 1 }],
				pickupDate: await dateIn(1),
			}),
		);
		expect(message).toContain("DATE_NOT_BOOKABLE");
	});

	it("refuses dates beyond the booking window", async () => {
		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: await productId("brochi"), qty: 1 }],
				pickupDate: await dateIn(29),
			}),
		);
		expect(message).toContain("DATE_NOT_BOOKABLE");
	});

	it("loses a day of lead time after the cut-off", async () => {
		const settings = await db.query<{ tz: string }>(
			"select timezone as tz from site_settings where id = 1",
		);
		const tz = settings.rows[0]!.tz;

		// What local time is it right now in the business timezone?
		const nowLocal = await db.query<{ t: string }>(
			`select to_char((now() at time zone $1)::time, 'HH24:MI:SS') as t`,
			[tz],
		);
		const localTime = nowLocal.rows[0]!.t;

		// Put the cut-off just before "now" so we are unambiguously past it, then
		// check that the earliest bookable date has moved out by one day.
		await db.query("update site_settings set cutoff_time = '00:00:01' where id = 1");
		const tooSoon = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: await productId("brochi"), qty: 1 }],
				pickupDate: await dateIn(2),
			}),
		);
		expect(tooSoon, `local time was ${localTime}`).toContain("DATE_NOT_BOOKABLE");

		// Move the cut-off to the very end of the day and the same date is fine.
		await db.query("update site_settings set cutoff_time = '23:59:59' where id = 1");
		const ok = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: await productId("brochi"), qty: 1 }],
				pickupDate: await dateIn(2),
			}),
		);
		expect(ok).toBeNull();

		await db.query("update site_settings set cutoff_time = '20:00' where id = 1");
	});

	it("refuses a closed day", async () => {
		const date = await dateIn(8);
		await db.query(
			"insert into availability_overrides (date, is_open, note) values ($1, false, 'away')",
			[date],
		);

		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: await productId("brochi"), qty: 1 }],
				pickupDate: date,
			}),
		);
		expect(message).toContain("DATE_CLOSED");

		await db.query("delete from availability_overrides where date = $1", [date]);
	});

	it("refuses a day that has reached capacity", async () => {
		const date = await dateIn(9);
		await db.query(
			"insert into availability_overrides (date, is_open, capacity) values ($1, true, 1)",
			[date],
		);

		const first = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: await productId("brochi"), qty: 1 }],
				pickupDate: date,
			}),
		);
		expect(first).toBeNull();

		const second = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: await productId("brochi"), qty: 1 }],
				pickupDate: date,
			}),
		);
		expect(second).toContain("DATE_FULL");

		await db.query("delete from availability_overrides where date = $1", [date]);
	});

	it("frees a slot again when an order is cancelled", async () => {
		const date = await dateIn(10);
		await db.query(
			"insert into availability_overrides (date, is_open, capacity) values ($1, true, 1)",
			[date],
		);

		const order = await placeOrder({
			items: [{ product_id: await productId("brochi"), qty: 1 }],
			pickupDate: date,
		});
		await db.query("update orders set status = 'cancelled' where id = $1", [order.id]);

		const again = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: await productId("brochi"), qty: 1 }],
				pickupDate: date,
			}),
		);
		expect(again).toBeNull();

		await db.query("delete from availability_overrides where date = $1", [date]);
	});

	it("rejects delivery while delivery is switched off", async () => {
		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: await productId("brochi"), qty: 1 }],
				pickupDate: await dateIn(7),
				fulfilment: "delivery",
				address: "1 Example Street",
			}),
		);
		expect(message).toContain("DELIVERY_DISABLED");
	});

	it("adds the delivery fee and requires an address once delivery is on", async () => {
		await db.query(
			"update site_settings set delivery_enabled = true, delivery_fee_cents = 800 where id = 1",
		);

		const missing = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: await productId("brochi"), qty: 1 }],
				pickupDate: await dateIn(7),
				fulfilment: "delivery",
				address: "   ",
			}),
		);
		expect(missing).toContain("DELIVERY_ADDRESS_REQUIRED");

		const order = await placeOrder({
			items: [{ product_id: await productId("brochi"), qty: 1 }],
			pickupDate: await dateIn(7),
			fulfilment: "delivery",
			address: "1 Example Street",
		});
		expect(order.total_cents).toBe(500 + 800);

		await db.query(
			"update site_settings set delivery_enabled = false, delivery_fee_cents = 0 where id = 1",
		);
	});

	// The pair 20260918000015 introduces. A fee she is quoting by hand must not
	// also be sitting in the column, or the order is charged for delivery behind
	// a page promising to tell her customer the figure first.
	it("will not hold a delivery fee while the fee is quoted by hand", async () => {
		const message = await errorOf(async () =>
			db.query(
				"update site_settings set delivery_fee_on_request = true, delivery_fee_cents = 800 where id = 1",
			),
		);
		expect(message).toContain("site_settings_delivery_fee_on_request_is_free");
	});

	it("charges nothing for delivery while the fee is quoted by hand", async () => {
		await db.query(
			"update site_settings set delivery_enabled = true, delivery_fee_cents = 0, delivery_fee_on_request = true where id = 1",
		);

		const order = await placeOrder({
			items: [{ product_id: await productId("brochi"), qty: 1 }],
			pickupDate: await dateIn(7),
			fulfilment: "delivery",
			address: "1 Example Street",
		});
		expect(order.total_cents).toBe(500);

		await db.query(
			"update site_settings set delivery_enabled = false, delivery_fee_on_request = false where id = 1",
		);
	});

	it("refuses everything while orders are closed", async () => {
		await db.query("update site_settings set orders_open = false where id = 1");

		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: await productId("brochi"), qty: 1 }],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("ORDERS_CLOSED");

		await db.query("update site_settings set orders_open = true where id = 1");
	});

	it("rate limits a burst from one address", async () => {
		const date = await dateIn(7);
		const brochi = await productId("brochi");

		for (let i = 0; i < 3; i += 1) {
			const attempt = await errorOf(() =>
				placeOrder({
					items: [{ product_id: brochi, qty: 1 }],
					pickupDate: date,
					ipHash: "burst",
				}),
			);
			expect(attempt, `attempt ${i + 1} should succeed`).toBeNull();
		}

		const fourth = await errorOf(() =>
			placeOrder({
				items: [{ product_id: brochi, qty: 1 }],
				pickupDate: date,
				ipHash: "burst",
			}),
		);
		expect(fourth).toContain("RATE_LIMITED");
	});

	it("gives every order a distinct reference and token", async () => {
		const result = await db.query<{
			refs: number;
			tokens: number;
			total: number;
		}>(
			`select count(distinct reference)::int as refs,
			        count(distinct token)::int as tokens,
			        count(*)::int as total
			 from orders`,
		);
		const { refs, tokens, total } = result.rows[0]!;
		expect(refs).toBe(total);
		expect(tokens).toBe(total);
	});
});

describe("variants", () => {
	let cakeId: string;
	let chocolate: string;
	let carrot: string;
	let redVelvet: string;

	/** The id of one of the cake's flavours, by name. */
	async function flavour(name: string): Promise<string> {
		const result = await db.query<{ id: string }>(
			"select id from product_variants where product_id = $1 and name = $2",
			[cakeId, name],
		);
		return result.rows[0]!.id;
	}

	beforeAll(async () => {
		await openEveryDay(50);

		const created = await db.query<{ id: string }>(
			`insert into products (name, slug, unit_price_cents, unit_label, variant_label, sort_order)
			 values ('Celebration Cake', 'celebration-cake', 4500, 'cake', 'Flavour', 90)
			 returning id`,
		);
		cakeId = created.rows[0]!.id;

		await db.query(
			`insert into product_variants (product_id, name, unit_price_cents, sort_order) values
				($1, 'Chocolate', 4500, 0),
				($1, 'Carrot & walnut', 5000, 1),
				($1, 'Red velvet', 5500, 2)`,
			[cakeId],
		);

		chocolate = await flavour("Chocolate");
		carrot = await flavour("Carrot & walnut");
		redVelvet = await flavour("Red velvet");
	});

	it("charges the flavour's own price, not the product's", async () => {
		const result = await db.query<{ total_cents: number; note: string }>(
			"select total_cents, note from price_for_qty($1, $2, $3)",
			[cakeId, 1, redVelvet],
		);
		expect(result.rows[0]).toEqual({ total_cents: 5500, note: "1 x $55.00 cake" });
	});

	it("falls back to the product's own price when no flavour is named", async () => {
		const result = await db.query<{ total_cents: number }>(
			"select total_cents from price_for_qty($1, $2)",
			[cakeId, 1],
		);
		expect(result.rows[0]!.total_cents).toBe(4500);
	});

	it("refuses to price a flavour belonging to another product", async () => {
		const message = await errorOf(async () =>
			db.query("select total_cents from price_for_qty($1, $2, $3)", [
				await productId("cupcakes"),
				1,
				chocolate,
			]),
		);
		expect(message).toContain("VARIANT_NOT_FOUND");
	});

	it("snapshots the flavour onto the order line", async () => {
		const order = await placeOrder({
			items: [{ product_id: cakeId, variant_id: carrot, qty: 1 }],
			pickupDate: await dateIn(7),
		});

		expect(order.total_cents).toBe(5000);

		const items = await db.query<{
			product_name: string;
			variant_name: string;
			product_variant_id: string;
			line_total_cents: number;
			pricing_note: string;
		}>(
			`select product_name, variant_name, product_variant_id, line_total_cents, pricing_note
			 from order_items where order_id = $1`,
			[order.id],
		);

		expect(items.rows).toEqual([
			{
				product_name: "Celebration Cake",
				variant_name: "Carrot & walnut",
				product_variant_id: carrot,
				line_total_cents: 5000,
				pricing_note: "1 x $50.00 cake",
			},
		]);
	});

	it("keeps two flavours of one product as two lines", async () => {
		const order = await placeOrder({
			items: [
				{ product_id: cakeId, variant_id: chocolate, qty: 1 },
				{ product_id: cakeId, variant_id: redVelvet, qty: 1 },
			],
			pickupDate: await dateIn(7),
		});

		expect(order.total_cents).toBe(10_000);

		const items = await db.query<{ variant_name: string; line_total_cents: number }>(
			`select variant_name, line_total_cents from order_items
			 where order_id = $1 order by variant_name`,
			[order.id],
		);
		expect(items.rows).toEqual([
			{ variant_name: "Chocolate", line_total_cents: 4500 },
			{ variant_name: "Red velvet", line_total_cents: 5500 },
		]);
	});

	it("leaves a plain product's line without a flavour beside a flavoured one", async () => {
		// The lines are written in one loop, so a flavoured line that ran first
		// must not leave its name behind on the plain line that follows.
		const order = await placeOrder({
			items: [
				{ product_id: cakeId, variant_id: chocolate, qty: 1 },
				{ product_id: await productId("brochi"), qty: 1 },
			],
			pickupDate: await dateIn(7),
		});

		const items = await db.query<{ product_name: string; variant_name: string | null }>(
			`select product_name, variant_name from order_items
			 where order_id = $1 order by product_name`,
			[order.id],
		);
		expect(items.rows).toEqual([
			{ product_name: "Brochi", variant_name: null },
			{ product_name: "Celebration Cake", variant_name: "Chocolate" },
		]);
	});

	it("merges a flavour listed twice into one line", async () => {
		const order = await placeOrder({
			items: [
				{ product_id: cakeId, variant_id: chocolate, qty: 1 },
				{ product_id: cakeId, variant_id: chocolate, qty: 1 },
			],
			pickupDate: await dateIn(7),
		});

		const items = await db.query<{ qty: number; line_total_cents: number }>(
			"select qty, line_total_cents from order_items where order_id = $1",
			[order.id],
		);
		expect(items.rows).toEqual([{ qty: 2, line_total_cents: 9000 }]);
	});

	it("counts min_per_order across every flavour, not one at a time", async () => {
		await db.query("update products set min_per_order = 4 where id = $1", [cakeId]);

		const message = await errorOf(async () =>
			placeOrder({
				items: [
					{ product_id: cakeId, variant_id: chocolate, qty: 1 },
					{ product_id: cakeId, variant_id: carrot, qty: 1 },
				],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("QTY_BELOW_MINIMUM");

		// Two of each is four cakes, which is the minimum, even though neither
		// flavour reaches it alone.
		const order = await placeOrder({
			items: [
				{ product_id: cakeId, variant_id: chocolate, qty: 2 },
				{ product_id: cakeId, variant_id: carrot, qty: 2 },
			],
			pickupDate: await dateIn(7),
		});
		expect(order.reference).toMatch(/^VV/);

		await db.query("update products set min_per_order = null where id = $1", [cakeId]);
	});

	it("counts a flavour carrying its own minimum on its own", async () => {
		// The chiffon's shape: eight is a rule about the slices, and the whole
		// cake sold beside them is ordered one at a time.
		await db.query("update products set min_per_order = 8 where id = $1", [cakeId]);
		await db.query("update product_variants set min_per_order = 1 where id = $1", [redVelvet]);

		// One of it alone is a real order, though the product asks for eight.
		const alone = await placeOrder({
			items: [{ product_id: cakeId, variant_id: redVelvet, qty: 1 }],
			pickupDate: await dateIn(7),
		});
		expect(alone.reference).toMatch(/^VV/);

		// And it does not help the flavours that still count together: four
		// chocolate is four of the eight the product asks for, whatever is
		// sitting in the basket beside them.
		const message = await errorOf(async () =>
			placeOrder({
				items: [
					{ product_id: cakeId, variant_id: chocolate, qty: 4 },
					{ product_id: cakeId, variant_id: redVelvet, qty: 4 },
				],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("QTY_BELOW_MINIMUM");

		// Its own number is a rule of its own, not an exemption from having one.
		await db.query("update product_variants set min_per_order = 3 where id = $1", [redVelvet]);
		const short = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: cakeId, variant_id: redVelvet, qty: 2 }],
				pickupDate: await dateIn(7),
			}),
		);
		expect(short).toContain("QTY_BELOW_MINIMUM");

		await db.query("update products set min_per_order = null where id = $1", [cakeId]);
		await db.query("update product_variants set min_per_order = null where id = $1", [redVelvet]);
	});

	it("charges the lower rate past the minimum, and charges a split basket right", async () => {
		// The mini cupcake arrangement on the cake fixture: two at the flavour's
		// own price, everything after at the product's lower rate.
		await db.query(
			"update products set min_per_order = 2, extra_unit_price_cents = 1500 where id = $1",
			[cakeId],
		);

		const three = await placeOrder({
			items: [{ product_id: cakeId, variant_id: chocolate, qty: 3 }],
			pickupDate: await dateIn(7),
		});
		const threeLines = await db.query<{ line_total_cents: number; pricing_note: string }>(
			"select line_total_cents, pricing_note from order_items where order_id = $1",
			[three.id],
		);
		expect(threeLines.rows).toEqual([
			{ line_total_cents: 4500 * 2 + 1500, pricing_note: "2 x $45.00 cake + 1 x $15.00 cake" },
		]);

		// Two flavours, one of each, is the minimum met across them, and both are
		// inside the allowance. $95 rather than $90 only because the carrot is the
		// dearer cake, not because it was split.
		const split = await placeOrder({
			items: [
				{ product_id: cakeId, variant_id: chocolate, qty: 1 },
				{ product_id: cakeId, variant_id: carrot, qty: 1 },
			],
			pickupDate: await dateIn(7),
		});
		const splitLines = await db.query<{ variant_name: string; line_total_cents: number }>(
			`select variant_name, line_total_cents from order_items
			 where order_id = $1 order by variant_name`,
			[split.id],
		);
		expect(splitLines.rows).toEqual([
			{ variant_name: "Carrot & walnut", line_total_cents: 5000 },
			{ variant_name: "Chocolate", line_total_cents: 4500 },
		]);

		const subtotal = await db.query<{ subtotal_cents: number }>(
			"select subtotal_cents from orders where id = $1",
			[split.id],
		);
		expect(subtotal.rows[0]!.subtotal_cents).toBe(9500);

		await db.query(
			"update products set min_per_order = null, extra_unit_price_cents = null where id = $1",
			[cakeId],
		);
	});

	it("charges the same for three however the flavours fall", async () => {
		// The rule in one test, and the reason 20260918000013 exists. It does not
		// matter how many flavours: past the first two, every one is $15.
		//
		// The three flavours are levelled to one price first, because a flavour
		// priced differently from its neighbours is a different question and the
		// test above already covers it. Here the only variable is the split.
		await db.query(
			`update products set min_per_order = 2, extra_unit_price_cents = 1500 where id = $1`,
			[cakeId],
		);
		await db.query("update product_variants set unit_price_cents = 4500 where product_id = $1", [
			cakeId,
		]);

		const splits: Array<Array<[string, number]>> = [
			[["choc", 3]],
			[
				["choc", 2],
				["carrot", 1],
			],
			[
				["choc", 1],
				["carrot", 1],
				["red", 1],
			],
		];
		const ids: Record<string, string> = { choc: chocolate, carrot, red: redVelvet };
		const totals: number[] = [];

		for (const [index, split] of splits.entries()) {
			const order = await placeOrder({
				items: split.map(([name, qty]) => ({
					product_id: cakeId,
					variant_id: ids[name]!,
					qty,
				})),
				// A day each, so three orders do not eat a day's capacity out from
				// under the tests that come after this one.
				pickupDate: await dateIn(7 + index),
			});
			const row = await db.query<{ subtotal_cents: number }>(
				"select subtotal_cents from orders where id = $1",
				[order.id],
			);
			totals.push(row.rows[0]!.subtotal_cents);

			// And the lines always add back up to it, however the allowance was
			// split between them.
			const lines = await db.query<{ sum: number }>(
				"select sum(line_total_cents)::int as sum from order_items where order_id = $1",
				[order.id],
			);
			expect(lines.rows[0]!.sum).toBe(row.rows[0]!.subtotal_cents);
		}

		// $45 + $45 + $15, three times over.
		expect(totals).toEqual([10500, 10500, 10500]);

		await db.query(
			"update products set min_per_order = null, extra_unit_price_cents = null where id = $1",
			[cakeId],
		);
		await db.query(
			`update product_variants set unit_price_cents = case name
				when 'Chocolate' then 4500 when 'Carrot & walnut' then 5000 else 5500 end
			 where product_id = $1`,
			[cakeId],
		);
	});

	it("refuses a flavoured product ordered without a flavour", async () => {
		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: cakeId, qty: 1 }],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("VARIANT_REQUIRED");
	});

	it("refuses a flavour that has sold out", async () => {
		await db.query("update product_variants set is_available = false where id = $1", [chocolate]);

		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: cakeId, variant_id: chocolate, qty: 1 }],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("VARIANT_UNAVAILABLE");

		await db.query("update product_variants set is_available = true where id = $1", [chocolate]);
	});

	it("refuses a flavour that belongs to a different product", async () => {
		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: await productId("cupcakes"), variant_id: chocolate, qty: 1 }],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("VARIANT_UNAVAILABLE");
	});

	it("applies a bundle price to the flavour's own price", async () => {
		await db.query(
			"insert into product_price_tiers (product_id, qty, price_cents) values ($1, 2, 8000)",
			[cakeId],
		);

		const order = await placeOrder({
			items: [{ product_id: cakeId, variant_id: redVelvet, qty: 2 }],
			pickupDate: await dateIn(7),
		});

		// Two red velvets at $55 would be $110; the bundle is an outright price
		// for two of one line, whichever line that is.
		expect(order.total_cents).toBe(8000);

		const items = await db.query<{ pricing_note: string }>(
			"select pricing_note from order_items where order_id = $1",
			[order.id],
		);
		expect(items.rows[0]!.pricing_note).toBe("1 x 2 for $80.00");

		await db.query("delete from product_price_tiers where product_id = $1", [cakeId]);
	});

	it("keeps the flavour's name on an order after the flavour is deleted", async () => {
		const order = await placeOrder({
			items: [{ product_id: cakeId, variant_id: carrot, qty: 1 }],
			pickupDate: await dateIn(7),
		});

		await db.query("delete from product_variants where id = $1", [carrot]);

		const items = await db.query<{ variant_name: string; product_variant_id: string | null }>(
			"select variant_name, product_variant_id from order_items where order_id = $1",
			[order.id],
		);
		expect(items.rows[0]).toEqual({
			variant_name: "Carrot & walnut",
			product_variant_id: null,
		});

		// Put it back for anything that runs after this.
		await db.query(
			`insert into product_variants (product_id, name, unit_price_cents, sort_order)
			 values ($1, 'Carrot & walnut', 5000, 1)`,
			[cakeId],
		);
		carrot = await flavour("Carrot & walnut");
	});

	it("takes every flavour with the product when the product is deleted", async () => {
		const doomed = await db.query<{ id: string }>(
			`insert into products (name, slug, unit_price_cents) values ('Doomed', 'doomed', 100)
			 returning id`,
		);
		const id = doomed.rows[0]!.id;
		await db.query(
			"insert into product_variants (product_id, name, unit_price_cents) values ($1, 'Only', 100)",
			[id],
		);

		await db.query("delete from products where id = $1", [id]);

		const left = await db.query("select id from product_variants where product_id = $1", [id]);
		expect(left.rows).toEqual([]);
	});

	it("refuses two flavours of one product with the same name", async () => {
		const message = await errorOf(async () =>
			db.query(
				"insert into product_variants (product_id, name, unit_price_cents) values ($1, 'Chocolate', 100)",
				[cakeId],
			),
		);
		expect(message).toContain("product_variants_product_id_name_key");
	});

	it("shows anonymous visitors the flavours but lets them change nothing", async () => {
		await db.as("anon", null, async () => {
			const rows = await db.query("select id from product_variants where product_id = $1", [
				cakeId,
			]);
			expect(rows.rows.length).toBeGreaterThan(0);

			await db.query("update product_variants set unit_price_cents = 1 where product_id = $1", [
				cakeId,
			]);
		});

		const after = await db.query<{ unit_price_cents: number }>(
			"select unit_price_cents from product_variants where id = $1",
			[chocolate],
		);
		expect(after.rows[0]!.unit_price_cents).toBe(4500);
	});
});

describe("row level security", () => {
	let ownerId: string;

	beforeAll(async () => {
		ownerId = await createOwner(db);
	});

	it("lets anonymous visitors read the catalogue", async () => {
		await db.as("anon", null, async () => {
			const products = await db.query("select id from products");
			expect(products.rows.length).toBeGreaterThan(0);

			const settings = await db.query("select business_name from site_settings");
			expect(settings.rows.length).toBe(1);

			const rules = await db.query("select weekday from availability_rules");
			expect(rules.rows.length).toBe(7);
		});
	});

	it("lets anonymous visitors read the questions", async () => {
		await db.as("anon", null, async () => {
			const faqs = await db.query("select question from faqs");
			expect(faqs.rows.length).toBe(5);
		});
	});

	it("stops anonymous visitors writing the questions", async () => {
		const message = await db.as("anon", null, () =>
			errorOf(() =>
				db.query("insert into faqs (question, answer) values ('Whose site is this?', 'Mine now')"),
			),
		);
		expect(message).toMatch(/row-level security|permission denied/i);

		await db.as("anon", null, async () => {
			const updated = await db.query("update faqs set answer = 'nonsense'");
			expect(updated.affectedRows ?? 0).toBe(0);

			const deleted = await db.query("delete from faqs");
			expect(deleted.affectedRows ?? 0).toBe(0);
		});
	});

	it("lets anonymous visitors read the reviews but never write them", async () => {
		await db.query(
			"insert into reviews (author, body, sort_order) values ('A customer', 'The cake was lovely', 1)",
		);

		await db.as("anon", null, async () => {
			const rows = await db.query("select author from reviews");
			expect(rows.rows).toHaveLength(1);

			const updated = await db.query("update reviews set body = 'not what they said'");
			expect(updated.affectedRows ?? 0).toBe(0);

			const deleted = await db.query("delete from reviews");
			expect(deleted.affectedRows ?? 0).toBe(0);
		});

		const message = await db.as("anon", null, () =>
			errorOf(() =>
				db.query("insert into reviews (author, body) values ('Mallory', 'Five stars, allegedly')"),
			),
		);
		expect(message).toMatch(/row-level security|permission denied/i);
	});

	it("hides orders from anonymous visitors", async () => {
		await db.as("anon", null, async () => {
			const orders = await db.query("select id from orders");
			expect(orders.rows).toHaveLength(0);

			const items = await db.query("select id from order_items");
			expect(items.rows).toHaveLength(0);

			const events = await db.query("select id from order_events");
			expect(events.rows).toHaveLength(0);
		});
	});

	it("hides bank details from anonymous visitors", async () => {
		await db.as("anon", null, async () => {
			const result = await db.query("select bank_account_number from site_settings_private");
			expect(result.rows).toHaveLength(0);
		});
	});

	it("stops anonymous visitors writing orders directly", async () => {
		const message = await db.as("anon", null, () =>
			errorOf(() =>
				db.query(
					`insert into orders (order_number, reference, pickup_date, customer_name, customer_email, customer_phone)
					 values (99999, 'VV99999', current_date + 7, 'Mallory', 'm@example.com', '000')`,
				),
			),
		);
		expect(message).toMatch(/row-level security|permission denied/i);
	});

	it("stops anonymous visitors editing the catalogue", async () => {
		await db.as("anon", null, async () => {
			const result = await db.query("update products set unit_price_cents = 1");
			expect(result.affectedRows ?? 0).toBe(0);
		});
	});

	it("stops anonymous visitors calling place_order", async () => {
		const message = await db.as("anon", null, () =>
			errorOf(() =>
				db.query(
					"select * from place_order('[]'::jsonb, current_date, 'pickup', 'a', 'b', 'c', null, null, null, null)",
				),
			),
		);
		expect(message).toMatch(/permission denied/i);
	});

	it("still lets anonymous visitors see per-day order counts", async () => {
		// The order form needs this to grey out full dates. It is aggregate only.
		await db.as("anon", null, async () => {
			const result = await db.query(
				"select pickup_date, order_count from order_counts_between(current_date - 1, current_date + 60)",
			);
			expect(result.rows.length).toBeGreaterThan(0);
		});
	});

	it("lets the owner read orders and bank details", async () => {
		await db.as("authenticated", ownerId, async () => {
			const orders = await db.query("select id from orders");
			expect(orders.rows.length).toBeGreaterThan(0);

			const bank = await db.query("select bank_account_number from site_settings_private");
			expect(bank.rows).toHaveLength(1);
		});
	});

	it("keeps a signed-in non-owner out", async () => {
		const stranger = await db.query<{ id: string }>(
			"insert into auth.users (email) values ('stranger@example.com') returning id",
		);

		await db.as("authenticated", stranger.rows[0]!.id, async () => {
			const orders = await db.query("select id from orders");
			expect(orders.rows).toHaveLength(0);

			const bank = await db.query("select bank_account_number from site_settings_private");
			expect(bank.rows).toHaveLength(0);

			const update = await db.query("update products set unit_price_cents = 1");
			expect(update.affectedRows ?? 0).toBe(0);
		});
	});
});

/**
 * Reordering renumbers the whole list rather than swapping two values, because
 * sort orders can arrive duplicated or all zero. These run last: they rewrite
 * every sort order in the table.
 */
describe("reordering", () => {
	let ownerId: string;

	beforeAll(async () => {
		ownerId = await createOwner(db, "reorder-owner@example.com");
	});

	/** Passed as a delimited string so there is no ambiguity about array binding. */
	const asUuidArray = "string_to_array($1, ',')::uuid[]";

	it("renumbers products from one, in the order given", async () => {
		const before = await db.query<{ id: string }>(
			"select id from products order by sort_order, name",
		);
		const reversed = before.rows.map((row) => row.id).reverse();

		await db.query(`select reorder_products(${asUuidArray})`, [reversed.join(",")]);

		const after = await db.query<{ id: string; sort_order: number }>(
			"select id, sort_order from products order by sort_order",
		);
		expect(after.rows.map((row) => row.id)).toEqual(reversed);
		expect(after.rows.map((row) => row.sort_order)).toEqual(reversed.map((_, index) => index + 1));
	});

	it("renumbers categories even when every sort order is identical", async () => {
		await db.query("update categories set sort_order = 0");
		const rows = await db.query<{ id: string }>("select id from categories order by name");
		const ids = rows.rows.map((row) => row.id);

		await db.query(`select reorder_categories(${asUuidArray})`, [ids.join(",")]);

		const after = await db.query<{ id: string; sort_order: number }>(
			"select id, sort_order from categories order by sort_order",
		);
		expect(after.rows.map((row) => row.id)).toEqual(ids);
		expect(after.rows.map((row) => row.sort_order)).toEqual(ids.map((_, index) => index + 1));
	});

	it("is not callable by anonymous visitors", async () => {
		const message = await db.as("anon", null, () =>
			errorOf(() => db.query("select reorder_products('{}'::uuid[])")),
		);
		expect(message).toMatch(/permission denied/i);
	});

	it("moves nothing for a signed-in non-owner", async () => {
		const stranger = await db.query<{ id: string }>(
			"insert into auth.users (email) values ('reorder-stranger@example.com') returning id",
		);
		const rows = await db.query<{ id: string }>("select id from products order by sort_order");
		const reversed = rows.rows.map((row) => row.id).reverse();

		await db.as("authenticated", stranger.rows[0]!.id, async () => {
			await db.query(`select reorder_products(${asUuidArray})`, [reversed.join(",")]);
		});

		const after = await db.query<{ id: string }>("select id from products order by sort_order");
		expect(after.rows.map((row) => row.id)).toEqual(rows.rows.map((row) => row.id));
	});

	it("lets the owner reorder", async () => {
		const rows = await db.query<{ id: string }>("select id from products order by sort_order");
		const reversed = rows.rows.map((row) => row.id).reverse();

		await db.as("authenticated", ownerId, async () => {
			await db.query(`select reorder_products(${asUuidArray})`, [reversed.join(",")]);
		});

		const after = await db.query<{ id: string }>("select id from products order by sort_order");
		expect(after.rows.map((row) => row.id)).toEqual(reversed);
	});
});

/**
 * The owner correcting what a customer typed.
 *
 * Nothing in the database stops her: `saveOrderDetails` writes plain columns,
 * deliberately without re-running the lead time, booking window and capacity
 * checks that `place_order` puts in a customer's way. What the schema does hold
 * is the trail, so the entry the admin writes has to be a kind the check
 * constraint accepts and the page knows how to render.
 */
describe("correcting an order's details", () => {
	// A date of its own. Nearly every order in this file is booked for dateIn(7),
	// which sits close enough to the capacity those tests set that two more would
	// push a later one into DATE_FULL.
	async function anOrder() {
		const cupcakes = await productId("cupcakes");
		return placeOrder({ items: [{ product_id: cupcakes, qty: 1 }], pickupDate: await dateIn(12) });
	}

	it("records the correction, with both halves of every field", async () => {
		const order = await anOrder();
		const changes = {
			changes: {
				pickup_date: { from: "2026-10-02", to: "2026-10-03" },
				customer_email: { from: "sam@exampl.com", to: "sam@example.com" },
			},
		};

		expect(
			await errorOf(() =>
				db.query("insert into order_events (order_id, type, data) values ($1, $2, $3)", [
					order.id,
					"details_edited",
					JSON.stringify(changes),
				]),
			),
		).toBeNull();

		const stored = await db.query<{ data: { changes: Record<string, unknown> } }>(
			"select data from order_events where order_id = $1 and type = 'details_edited'",
			[order.id],
		);

		expect(stored.rows[0]!.data.changes).toEqual(changes.changes);
	});

	it("lets the owner move an order onto a day no customer could have booked", async () => {
		const order = await anOrder();
		// A Sunday two years ago: shut, long past its lead time, and nowhere near
		// the booking window. `place_order` refuses all three; the admin's update
		// is not `place_order`, and she is the one who decides what can be baked.
		expect(
			await errorOf(() =>
				db.query("update orders set pickup_date = '2024-01-07' where id = $1", [order.id]),
			),
		).toBeNull();
	});
});

/**
 * A bounce arrives minutes after the send, by webhook, and the only thing tying
 * the two together is Resend's id for the message. The check constraint on
 * `type` is what stops that route quietly writing rows the admin has no way to
 * render, so it has to know about the kinds the route actually writes.
 */
describe("the email delivery trail", () => {
	async function anOrder() {
		const cupcakes = await productId("cupcakes");
		return placeOrder({ items: [{ product_id: cupcakes, qty: 1 }], pickupDate: await dateIn(7) });
	}

	const recordEvent = (orderId: string, type: string) =>
		errorOf(() =>
			db.query("insert into order_events (order_id, type, data) values ($1, $2, $3)", [
				orderId,
				type,
				JSON.stringify({ emailId: "re_0123456789", template: "order-confirmed" }),
			]),
		);

	it.each(["email_sent", "email_failed", "email_bounced", "email_complained"])(
		"records a %s event",
		async (type) => {
			const order = await anOrder();
			expect(await recordEvent(order.id, type)).toBeNull();
		},
	);

	it("refuses a kind of event nothing knows how to render", async () => {
		const order = await anOrder();
		expect(await recordEvent(order.id, "email_opened")).toContain("order_events_type_check");
	});

	it("finds the send a bounce belongs to by the message id alone", async () => {
		const order = await anOrder();
		await recordEvent(order.id, "email_sent");

		// The lookup the webhook route makes, with nothing to go on but the id.
		const found = await db.query<{ order_id: string }>(
			"select order_id from order_events where type = 'email_sent' and data->>'emailId' = $1",
			["re_0123456789"],
		);

		expect(found.rows.map((row) => row.order_id)).toContain(order.id);
	});
});

/**
 * A product with two option groups rather than one: three flavours by two
 * layer counts, priced one combination at a time.
 *
 * The flat-variant tests above are the other half of this. Nothing there has a
 * row in any of these tables, and the fact that they still pass unchanged is
 * the point: a second group is something a product opts into, not something
 * every product had done to it.
 */
describe("variants made of several options", () => {
	let cakeId: string;
	let flavourGroup: string;
	let layerGroup: string;
	const optionIds: Record<string, string> = {};
	const variantIds: Record<string, string> = {};

	async function makeOption(groupId: string, name: string, sortOrder: number): Promise<string> {
		const result = await db.query<{ id: string }>(
			`insert into product_options (group_id, name, sort_order) values ($1, $2, $3) returning id`,
			[groupId, name, sortOrder],
		);
		return result.rows[0]!.id;
	}

	/** A priced combination, linked to the options it is made of. */
	async function makeVariant(name: string, cents: number, options: string[]): Promise<string> {
		const created = await db.query<{ id: string }>(
			`insert into product_variants (product_id, name, unit_price_cents) values ($1, $2, $3)
			 returning id`,
			[cakeId, name, cents],
		);
		const variantId = created.rows[0]!.id;

		for (const option of options) {
			await db.query(
				`insert into product_variant_options (variant_id, group_id, option_id)
				 select $1, o.group_id, o.id from product_options o where o.id = $2`,
				[variantId, option],
			);
		}
		return variantId;
	}

	beforeAll(async () => {
		await openEveryDay(50);

		const created = await db.query<{ id: string }>(
			`insert into products (name, slug, unit_price_cents, unit_label, sort_order)
			 values ('Layer Cake', 'layer-cake', 4500, 'cake', 91)
			 returning id`,
		);
		cakeId = created.rows[0]!.id;

		const groups = await db.query<{ id: string; name: string }>(
			`insert into product_option_groups (product_id, name, sort_order) values
				($1, 'Flavour', 0), ($1, 'Layers', 1)
			 returning id, name`,
			[cakeId],
		);
		flavourGroup = groups.rows.find((row) => row.name === "Flavour")!.id;
		layerGroup = groups.rows.find((row) => row.name === "Layers")!.id;

		optionIds.chocolate = await makeOption(flavourGroup, "Chocolate", 0);
		optionIds.carrot = await makeOption(flavourGroup, "Carrot", 1);
		optionIds.two = await makeOption(layerGroup, "2 layers", 0);
		optionIds.three = await makeOption(layerGroup, "3 layers", 1);

		variantIds.chocolateTwo = await makeVariant("Chocolate · 2 layers", 4500, [
			optionIds.chocolate!,
			optionIds.two!,
		]);
		variantIds.chocolateThree = await makeVariant("Chocolate · 3 layers", 6500, [
			optionIds.chocolate!,
			optionIds.three!,
		]);
		variantIds.carrotTwo = await makeVariant("Carrot · 2 layers", 5000, [
			optionIds.carrot!,
			optionIds.two!,
		]);
	});

	it("charges the combination's own price", async () => {
		const order = await placeOrder({
			items: [{ product_id: cakeId, variant_id: variantIds.chocolateThree!, qty: 1 }],
			pickupDate: await dateIn(7),
		});
		expect(order.total_cents).toBe(6500);
	});

	it("writes the whole combination's name onto the order", async () => {
		const order = await placeOrder({
			items: [{ product_id: cakeId, variant_id: variantIds.carrotTwo!, qty: 1 }],
			pickupDate: await dateIn(7),
		});

		const items = await db.query<{ variant_name: string }>(
			"select variant_name from order_items where order_id = $1",
			[order.id],
		);
		expect(items.rows[0]!.variant_name).toBe("Carrot · 2 layers");
	});

	it("takes every combination of an option down when the option sells out", async () => {
		await db.query("update product_options set is_available = false where id = $1", [
			optionIds.chocolate,
		]);

		// The combination's own switch is untouched and still on, which is exactly
		// the basket that would have slipped through without the extra check.
		for (const variantId of [variantIds.chocolateTwo!, variantIds.chocolateThree!]) {
			const message = await errorOf(async () =>
				placeOrder({
					items: [{ product_id: cakeId, variant_id: variantId, qty: 1 }],
					pickupDate: await dateIn(7),
				}),
			);
			expect(message).toContain("VARIANT_UNAVAILABLE");
		}

		// And nothing else goes down with it.
		const carrot = await placeOrder({
			items: [{ product_id: cakeId, variant_id: variantIds.carrotTwo!, qty: 1 }],
			pickupDate: await dateIn(7),
		});
		expect(carrot.total_cents).toBe(5000);

		await db.query("update product_options set is_available = true where id = $1", [
			optionIds.chocolate,
		]);
	});

	it("counts the whole product for a minimum, however it was split up", async () => {
		await db.query("update products set min_per_order = 2 where id = $1", [cakeId]);

		const split = await placeOrder({
			items: [
				{ product_id: cakeId, variant_id: variantIds.chocolateTwo!, qty: 1 },
				{ product_id: cakeId, variant_id: variantIds.carrotTwo!, qty: 1 },
			],
			pickupDate: await dateIn(7),
		});
		expect(split.total_cents).toBe(9500);

		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: cakeId, variant_id: variantIds.carrotTwo!, qty: 1 }],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("QTY_BELOW_MINIMUM");

		await db.query("update products set min_per_order = null where id = $1", [cakeId]);
	});

	it("refuses a combination that takes two options from one group", async () => {
		const message = await errorOf(async () =>
			db.query(
				`insert into product_variant_options (variant_id, group_id, option_id)
				 values ($1, $2, $3)`,
				[variantIds.carrotTwo, flavourGroup, optionIds.chocolate],
			),
		);
		expect(message).toContain("product_variant_options_pkey");
	});

	it("refuses an option filed under a group it does not belong to", async () => {
		// Half-built on purpose: a combination that already held a layers option
		// would trip the key above before the foreign key was reached.
		const half = await makeVariant("Half built", 100, [optionIds.chocolate!]);

		const message = await errorOf(async () =>
			db.query(
				`insert into product_variant_options (variant_id, group_id, option_id)
				 values ($1, $2, $3)`,
				[half, layerGroup, optionIds.carrot],
			),
		);
		expect(message).toContain("product_variant_options_option_id_group_id_fkey");

		await db.query("delete from product_variants where id = $1", [half]);
	});

	it("stops selling a combination that has lost one of its options", async () => {
		const lemon = await makeOption(flavourGroup, "Lemon", 9);
		const lemonTwo = await makeVariant("Lemon · 2 layers", 4800, [lemon, optionIds.two!]);

		await db.query("delete from product_options where id = $1", [lemon]);

		// Deleting the option takes the link to it and nothing else, so the
		// combination is still here, still switched on, and now draws on one of
		// the two groups the product offers.
		const links = await db.query("select 1 from product_variant_options where variant_id = $1", [
			lemonTwo,
		]);
		expect(links.rows).toHaveLength(1);

		// A basket filled before she deleted the flavour still knows the id. It
		// cannot be allowed to buy something the page can no longer describe.
		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: cakeId, variant_id: lemonTwo, qty: 1 }],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("VARIANT_UNAVAILABLE");

		await db.query("delete from product_variants where id = $1", [lemonTwo]);
	});

	it("takes the whole group down with the product", async () => {
		const spare = await db.query<{ id: string }>(
			`insert into products (name, slug, unit_price_cents, sort_order)
			 values ('Spare', 'spare-cake', 100, 92) returning id`,
		);
		const spareId = spare.rows[0]!.id;
		await db.query(`insert into product_option_groups (product_id, name) values ($1, 'Size')`, [
			spareId,
		]);

		await db.query("delete from products where id = $1", [spareId]);

		const left = await db.query("select 1 from product_option_groups where product_id = $1", [
			spareId,
		]);
		expect(left.rows).toHaveLength(0);
	});

	it("carries a combination name longer than a single option's onto the order", async () => {
		// Two 60-character options joined is 123 characters, which is what the
		// widened columns are for. One character under the limit on both ends.
		const long = await makeOption(layerGroup, "L".repeat(60), 8);
		const name = `${"C".repeat(57)} · ${"L".repeat(60)}`;
		expect(name).toHaveLength(120);

		const longVariant = await makeVariant(name, 9900, [optionIds.carrot!, long]);

		const order = await placeOrder({
			items: [{ product_id: cakeId, variant_id: longVariant, qty: 1 }],
			pickupDate: await dateIn(7),
		});

		const items = await db.query<{ variant_name: string }>(
			"select variant_name from order_items where order_id = $1",
			[order.id],
		);
		expect(items.rows[0]!.variant_name).toBe(name);

		await db.query("delete from product_options where id = $1", [long]);
		await db.query("delete from product_variants where id = $1", [longVariant]);
	});
});

/**
 * Extras: the paid things that ride along with a line rather than replacing it.
 *
 * The rules worth holding down are that they are priced per unit of the line,
 * that they never disturb `line_total_cents` or the note that explains it, and
 * that a basket filled before one sold out is refused rather than quietly baked
 * without it.
 */
describe("extras", () => {
	let cupcakes: string;
	let candles: string;
	let giftBox: string;

	async function makeExtra(
		name: string,
		priceCents: number,
		sortOrder: number,
		productId?: string,
	): Promise<string> {
		const result = await db.query<{ id: string }>(
			`insert into product_extras (product_id, name, price_cents, sort_order)
			 values ($1, $2, $3, $4) returning id`,
			[productId ?? cupcakes, name, priceCents, sortOrder],
		);
		return result.rows[0]!.id;
	}

	async function extrasOf(orderId: string) {
		const result = await db.query<{
			name: string;
			qty: number;
			unit_price_cents: number;
			line_total_cents: number;
		}>(
			`select x.name, x.qty, x.unit_price_cents, x.line_total_cents
			 from order_item_extras x
			 join order_items i on i.id = x.order_item_id
			 where i.order_id = $1
			 order by x.sort_order, x.name`,
			[orderId],
		);
		return result.rows;
	}

	beforeAll(async () => {
		await openEveryDay(50);
		cupcakes = await productId("cupcakes");
		candles = await makeExtra("Birthday candles", 300, 1);
		giftBox = await makeExtra("Gift box", 800, 2);
	});

	it("ships with none, so every product takes orders exactly as it did", async () => {
		// The migration seeds nothing on purpose: a price on a public page that
		// the owner never agreed to charge is worse than an empty list.
		const rows = await db.query<{ n: number }>(
			"select count(*)::int as n from product_extras where name not in ('Birthday candles', 'Gift box')",
		);
		expect(rows.rows[0]!.n).toBe(0);
	});

	it("charges an extra once per unit of the line", async () => {
		const order = await placeOrder({
			items: [{ product_id: cupcakes, qty: 2, extra_ids: [candles] }],
			pickupDate: await dateIn(7),
		});

		// Two cupcakes at $3 is $6, plus two sets of candles at $3 is $6.
		expect(order.total_cents).toBe(1200);
		expect(await extrasOf(order.id)).toEqual([
			{ name: "Birthday candles", qty: 2, unit_price_cents: 300, line_total_cents: 600 },
		]);
	});

	it("leaves the line total and its note saying what the menu charged", async () => {
		const order = await placeOrder({
			items: [{ product_id: cupcakes, qty: 1, extra_ids: [giftBox] }],
			pickupDate: await dateIn(7),
		});

		const items = await db.query<{ line_total_cents: number; pricing_note: string }>(
			"select line_total_cents, pricing_note from order_items where order_id = $1",
			[order.id],
		);

		// `pricing_note` explains `line_total_cents`, so folding $8 of gift box
		// into it would make one of the two a lie. The extra is its own row.
		expect(items.rows[0]!.line_total_cents).toBe(300);
		expect(items.rows[0]!.pricing_note).toBe("1 x $3.00 each");
		expect(order.total_cents).toBe(1100);
	});

	it("makes the same thing with and without extras two lines", async () => {
		const order = await placeOrder({
			items: [
				{ product_id: cupcakes, qty: 1, extra_ids: [candles] },
				{ product_id: cupcakes, qty: 1 },
			],
			pickupDate: await dateIn(7),
		});

		const items = await db.query<{ n: number }>(
			"select count(*)::int as n from order_items where order_id = $1",
			[order.id],
		);
		expect(items.rows[0]!.n).toBe(2);
		// $3 and $3 for the cupcakes, and one set of candles on one of them.
		expect(order.total_cents).toBe(900);
	});

	it("treats the same two extras picked in either order as one line", async () => {
		const order = await placeOrder({
			items: [
				{ product_id: cupcakes, qty: 1, extra_ids: [candles, giftBox] },
				{ product_id: cupcakes, qty: 1, extra_ids: [giftBox, candles] },
			],
			pickupDate: await dateIn(7),
		});

		const items = await db.query<{ n: number }>(
			"select count(*)::int as n from order_items where order_id = $1",
			[order.id],
		);
		expect(items.rows[0]!.n).toBe(1);

		// Two cupcakes, two sets of candles, two gift boxes.
		expect(await extrasOf(order.id)).toEqual([
			{ name: "Birthday candles", qty: 2, unit_price_cents: 300, line_total_cents: 600 },
			{ name: "Gift box", qty: 2, unit_price_cents: 800, line_total_cents: 1600 },
		]);
		expect(order.total_cents).toBe(2800);
	});

	it("de-duplicates an extra named twice on one line", async () => {
		const order = await placeOrder({
			items: [{ product_id: cupcakes, qty: 1, extra_ids: [candles, candles] }],
			pickupDate: await dateIn(7),
		});

		expect(await extrasOf(order.id)).toEqual([
			{ name: "Birthday candles", qty: 1, unit_price_cents: 300, line_total_cents: 300 },
		]);
		expect(order.total_cents).toBe(600);
	});

	it("refuses a basket holding an extra that has since sold out", async () => {
		await db.query("update product_extras set is_available = false where id = $1", [candles]);

		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: cupcakes, qty: 1, extra_ids: [candles] }],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("EXTRA_UNAVAILABLE");

		await db.query("update product_extras set is_available = true where id = $1", [candles]);
	});

	it("refuses an extra that is no longer on the list at all", async () => {
		const gone = await makeExtra("Sparklers", 500, 9);
		await db.query("delete from product_extras where id = $1", [gone]);

		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: cupcakes, qty: 1, extra_ids: [gone] }],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("EXTRA_UNAVAILABLE");
	});

	it("records a free extra rather than dropping it", async () => {
		const note = await makeExtra("Happy birthday on the box", 0, 3);

		const order = await placeOrder({
			items: [{ product_id: cupcakes, qty: 1, extra_ids: [note] }],
			pickupDate: await dateIn(7),
		});

		// Free, but still something she has to remember to do.
		expect(await extrasOf(order.id)).toEqual([
			{ name: "Happy birthday on the box", qty: 1, unit_price_cents: 0, line_total_cents: 0 },
		]);
		expect(order.total_cents).toBe(300);

		await db.query("delete from product_extras where id = $1", [note]);
	});

	it("keeps what a past order carried after the extra is deleted", async () => {
		const topper = await makeExtra("Cake topper", 1500, 8);

		const order = await placeOrder({
			items: [{ product_id: cupcakes, qty: 1, extra_ids: [topper] }],
			pickupDate: await dateIn(7),
		});

		await db.query("delete from product_extras where id = $1", [topper]);

		// The name and the price are the order's own copy, so it still says what
		// was bought and what it cost.
		expect(await extrasOf(order.id)).toEqual([
			{ name: "Cake topper", qty: 1, unit_price_cents: 1500, line_total_cents: 1500 },
		]);

		const link = await db.query<{ extra_id: string | null }>(
			`select x.extra_id from order_item_extras x
			 join order_items i on i.id = x.order_item_id
			 where i.order_id = $1`,
			[order.id],
		);
		expect(link.rows[0]!.extra_id).toBeNull();
	});

	it("refuses an extra that belongs to a different product", async () => {
		// The basket is localStorage and its ids are the customer's to edit. Without
		// the product_id check in place_order, the cheap candles off one product
		// would ride a cake priced for the good ones.
		const brochi = await productId("brochi");
		const theirs = await makeExtra("Brochi ribbon", 100, 1, brochi);

		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: cupcakes, qty: 1, extra_ids: [theirs] }],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("EXTRA_UNAVAILABLE");

		// And it is genuinely orderable on the product that owns it, so the refusal
		// above is about ownership rather than about the row being broken.
		const ok = await placeOrder({
			items: [{ product_id: brochi, qty: 1, extra_ids: [theirs] }],
			pickupDate: await dateIn(7),
		});
		expect(await extrasOf(ok.id)).toEqual([
			{ name: "Brochi ribbon", qty: 1, unit_price_cents: 100, line_total_cents: 100 },
		]);

		await db.query("delete from orders where id = $1", [ok.id]);
		await db.query("delete from product_extras where id = $1", [theirs]);
	});

	it("takes an extra down with the product that owns it", async () => {
		const spare = await db.query<{ id: string }>(
			`insert into products (name, slug, unit_price_cents, sort_order)
			 values ('Spare for extras', 'spare-for-extras', 100, 93) returning id`,
		);
		const spareId = spare.rows[0]!.id;
		await makeExtra("Ribbon", 100, 1, spareId);

		await db.query("delete from products where id = $1", [spareId]);

		const left = await db.query("select 1 from product_extras where product_id = $1", [spareId]);
		expect(left.rows).toHaveLength(0);
	});

	it("lets two products each have an extra of the same name", async () => {
		const brochi = await productId("brochi");
		// Unique is (product_id, name), not name, so this is allowed and "Candles"
		// on the cupcakes goes on meaning the cupcakes' candles.
		const mine = await makeExtra("Shared name", 200, 7);
		const theirs = await makeExtra("Shared name", 900, 7, brochi);

		expect(mine).not.toBe(theirs);

		await db.query("delete from product_extras where id = any($1)", [[mine, theirs]]);
	});

	it("takes the extras off a line down with the order", async () => {
		const order = await placeOrder({
			items: [{ product_id: cupcakes, qty: 1, extra_ids: [candles] }],
			pickupDate: await dateIn(7),
		});

		await db.query("delete from orders where id = $1", [order.id]);

		expect(await extrasOf(order.id)).toHaveLength(0);
	});

	it("shows the list to anonymous visitors but hides what anyone ordered", async () => {
		const order = await placeOrder({
			items: [{ product_id: cupcakes, qty: 1, extra_ids: [candles] }],
			pickupDate: await dateIn(7),
		});

		await db.as("anon", null, async () => {
			// The menu is public: the picker on a product page is built from it.
			const list = await db.query("select name from product_extras");
			expect(list.rows.length).toBeGreaterThan(0);

			// What a named customer bought is not.
			const carried = await db.query("select id from order_item_extras");
			expect(carried.rows).toHaveLength(0);
		});

		const message = await db.as("anon", null, () =>
			errorOf(() =>
				db.query(
					`insert into product_extras (product_id, name, price_cents)
					 values ((select id from products limit 1), 'Free cake', 0)`,
				),
			),
		);
		expect(message).toMatch(/row-level security|permission denied/i);

		await db.query("delete from orders where id = $1", [order.id]);
	});
});

/**
 * Extras you can have more than one of.
 *
 * Candles are the case the tick box could not answer: "candles" is really "how
 * many candles", and the number is the whole question on a sixth birthday. The
 * rules worth holding down are that the count multiplies the price *as well as*
 * the line's own quantity, that two counts of one extra are two lines, that a
 * count past the product's cap is refused rather than quietly cut down, and
 * that a caller written before any of this still means one of each.
 */
describe("extras by the number", () => {
	let cupcakes: string;
	/** Up to a dozen, which is what makes the picker a picker. */
	let candles: string;
	/** One or none, like every extra that shipped before this. */
	let giftBox: string;

	async function makeExtra(
		name: string,
		priceCents: number,
		maxQty: number,
		sortOrder: number,
	): Promise<string> {
		const result = await db.query<{ id: string }>(
			`insert into product_extras (product_id, name, price_cents, max_qty, sort_order)
			 values ($1, $2, $3, $4, $5) returning id`,
			[cupcakes, name, priceCents, maxQty, sortOrder],
		);
		return result.rows[0]!.id;
	}

	/** Like `extrasOf` above, and also asking how many of each were carried. */
	async function countedExtrasOf(orderId: string) {
		const result = await db.query<{
			name: string;
			qty: number;
			unit_qty: number;
			unit_price_cents: number;
			line_total_cents: number;
		}>(
			`select x.name, x.qty, x.unit_qty, x.unit_price_cents, x.line_total_cents
			 from order_item_extras x
			 join order_items i on i.id = x.order_item_id
			 where i.order_id = $1
			 -- unit_qty because the two rows one test here cares about are the same
			 -- extra at two counts, so sort_order and name match on both and the
			 -- order was otherwise whatever the rows happened to be written in.
			 order by x.sort_order, x.name, x.unit_qty`,
			[orderId],
		);
		return result.rows;
	}

	beforeAll(async () => {
		await openEveryDay(50);
		cupcakes = await productId("cupcakes");
		candles = await makeExtra("Candles by the number", 300, 12, 1);
		giftBox = await makeExtra("Boxed by the number", 800, 1, 2);
	});

	afterAll(async () => {
		await db.query("delete from product_extras where id = any($1)", [[candles, giftBox]]);
	});

	it("defaults every extra to one, so nothing that shipped before changes", async () => {
		const rows = await db.query<{ n: number }>(
			"select count(*)::int as n from product_extras where max_qty <> 1 and id <> $1",
			[candles],
		);
		expect(rows.rows[0]!.n).toBe(0);
	});

	it("charges the count as well as the line's own quantity", async () => {
		const order = await placeOrder({
			items: [{ product_id: cupcakes, qty: 2, extras: [{ id: candles, qty: 6 }] }],
			pickupDate: await dateIn(7),
		});

		// Two cupcakes at $3 is $6, plus six candles at $3 on each of the two.
		expect(order.total_cents).toBe(600 + 300 * 6 * 2);
		expect(await countedExtrasOf(order.id)).toEqual([
			{
				name: "Candles by the number",
				qty: 2,
				unit_qty: 6,
				unit_price_cents: 300,
				line_total_cents: 3600,
			},
		]);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("leaves the menu line alone, the way one of an extra always did", async () => {
		const order = await placeOrder({
			items: [{ product_id: cupcakes, qty: 4, extras: [{ id: candles, qty: 12 }] }],
			pickupDate: await dateIn(7),
		});

		// The bundle price still decides the cupcakes and `pricing_note` still
		// explains only that. Folding a dozen candles into it would make one of
		// the two a lie.
		const line = await db.query<{ line_total_cents: number; pricing_note: string }>(
			"select line_total_cents, pricing_note from order_items where order_id = $1",
			[order.id],
		);
		expect(line.rows[0]!.line_total_cents).toBe(1200);
		expect(line.rows[0]!.pricing_note).toBe("1 x 4 for $12.00");

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("makes two counts of one extra two lines", async () => {
		const order = await placeOrder({
			items: [
				{ product_id: cupcakes, qty: 1, extras: [{ id: candles, qty: 6 }] },
				{ product_id: cupcakes, qty: 1, extras: [{ id: candles, qty: 1 }] },
			],
			pickupDate: await dateIn(7),
		});

		const lines = await db.query("select id from order_items where order_id = $1", [order.id]);
		expect(lines.rows).toHaveLength(2);
		expect(await countedExtrasOf(order.id)).toEqual([
			{
				name: "Candles by the number",
				qty: 1,
				unit_qty: 1,
				unit_price_cents: 300,
				line_total_cents: 300,
			},
			{
				name: "Candles by the number",
				qty: 1,
				unit_qty: 6,
				unit_price_cents: 300,
				line_total_cents: 1800,
			},
		]);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("treats the same count picked in either order as one line", async () => {
		const order = await placeOrder({
			items: [
				{
					product_id: cupcakes,
					qty: 1,
					extras: [
						{ id: candles, qty: 6 },
						{ id: giftBox, qty: 1 },
					],
				},
				{
					product_id: cupcakes,
					qty: 1,
					extras: [
						{ id: giftBox, qty: 1 },
						{ id: candles, qty: 6 },
					],
				},
			],
			pickupDate: await dateIn(7),
		});

		const lines = await db.query("select id from order_items where order_id = $1", [order.id]);
		expect(lines.rows).toHaveLength(1);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("keeps the larger count when one extra is named twice on a line", async () => {
		const order = await placeOrder({
			items: [
				{
					product_id: cupcakes,
					qty: 1,
					extras: [
						{ id: candles, qty: 1 },
						{ id: candles, qty: 6 },
					],
				},
			],
			pickupDate: await dateIn(7),
		});

		// One row, charged once, at the number they asked for rather than at the
		// sum of the two. `normaliseExtras` in lib/pricing.ts does the same.
		expect(await countedExtrasOf(order.id)).toEqual([
			{
				name: "Candles by the number",
				qty: 1,
				unit_qty: 6,
				unit_price_cents: 300,
				line_total_cents: 1800,
			},
		]);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("refuses more of an extra than the product allows", async () => {
		// A basket filled while the cap was higher. Refused rather than cut down
		// to twelve, for the same reason a sold-out extra is refused rather than
		// dropped: what arrives has to be what was agreed to.
		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: cupcakes, qty: 1, extras: [{ id: candles, qty: 13 }] }],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("EXTRA_QTY_INVALID");
	});

	it("refuses two of something sold one at a time", async () => {
		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: cupcakes, qty: 1, extras: [{ id: giftBox, qty: 2 }] }],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("EXTRA_QTY_INVALID");
	});

	it("still says EXTRA_UNAVAILABLE for an id that names nothing", async () => {
		// Checked before the cap is, so an id with no row behind it comes back as
		// the answer it always did rather than falling through the cap's join.
		const gone = await makeExtra("Gone by the number", 500, 6, 9);
		await db.query("delete from product_extras where id = $1", [gone]);

		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: cupcakes, qty: 1, extras: [{ id: gone, qty: 4 }] }],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("EXTRA_UNAVAILABLE");
	});

	it("reads a caller that sends no count, or a nonsense one, as one", async () => {
		// Neither is something the order form sends. A cast error here would take
		// down the whole order rather than the one field, so anything that is not
		// a plain number counts as one.
		const order = await placeOrder({
			items: [{ product_id: cupcakes, qty: 1, extras: [{ id: candles, qty: "lots" }] }],
			pickupDate: await dateIn(7),
		});

		expect(await countedExtrasOf(order.id)).toEqual([
			{
				name: "Candles by the number",
				qty: 1,
				unit_qty: 1,
				unit_price_cents: 300,
				line_total_cents: 300,
			},
		]);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("still takes extra_ids, and still means one of each", async () => {
		// The signature did not change, so a caller written before quantities
		// existed — and every order already placed — goes on meaning what it meant.
		const order = await placeOrder({
			items: [{ product_id: cupcakes, qty: 1, extra_ids: [candles] }],
			pickupDate: await dateIn(7),
		});

		expect(order.total_cents).toBe(300 + 300);
		expect(await countedExtrasOf(order.id)).toEqual([
			{
				name: "Candles by the number",
				qty: 1,
				unit_qty: 1,
				unit_price_cents: 300,
				line_total_cents: 300,
			},
		]);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("lands a line sent both ways on one row, at the larger count", async () => {
		const order = await placeOrder({
			items: [
				{
					product_id: cupcakes,
					qty: 1,
					extra_ids: [candles],
					extras: [{ id: candles, qty: 4 }],
				},
			],
			pickupDate: await dateIn(7),
		});

		expect(await countedExtrasOf(order.id)).toEqual([
			{
				name: "Candles by the number",
				qty: 1,
				unit_qty: 4,
				unit_price_cents: 300,
				line_total_cents: 1200,
			},
		]);

		await db.query("delete from orders where id = $1", [order.id]);
	});
});

/**
 * The custom cake as a product, and the brief that now belongs to the line
 * rather than to the order.
 *
 * Both halves of this are things the browser cannot be trusted with. The
 * browser decides what to *show*; `place_order` decides what a line costs and
 * whether two lines are one line, and those are the decisions covered here.
 */
describe("the custom cake as a product", () => {
	let customCake: string;
	let cupcakes: string;
	let size: string;

	async function itemsOf(orderId: string) {
		const result = await db.query<{
			product_name: string;
			variant_name: string | null;
			qty: number;
			line_total_cents: number;
			pricing_note: string | null;
			note: string | null;
			inspiration_url: string | null;
			inspiration_image_paths: string[];
			price_on_request: boolean;
		}>(
			`select product_name, variant_name, qty, line_total_cents, pricing_note,
				note, inspiration_url, inspiration_image_paths, price_on_request
			 from order_items where order_id = $1
			 order by product_name, coalesce(note, ''), qty`,
			[orderId],
		);
		return result.rows;
	}

	beforeAll(async () => {
		await openEveryDay(50);
		customCake = await productId("custom-cake");
		cupcakes = await productId("cupcakes");
		const sizes = await db.query<{ id: string }>(
			"select id from product_variants where product_id = $1 order by sort_order limit 1",
			[customCake],
		);
		size = sizes.rows[0]!.id;
	});

	it("is seeded priced on request, asking for a brief, with sizes to pick from", async () => {
		const result = await db.query<{
			price_on_request: boolean;
			wants_brief: boolean;
			is_available: boolean;
			variant_label: string;
			variants: number;
		}>(
			`select p.price_on_request, p.wants_brief, p.is_available, p.variant_label,
				(select count(*)::int from product_variants v where v.product_id = p.id) as variants
			 from products p where p.slug = 'custom-cake'`,
		);

		expect(result.rows[0]).toMatchObject({
			price_on_request: true,
			wants_brief: true,
			is_available: true,
			variant_label: "Size",
		});
		expect(result.rows[0]!.variants).toBeGreaterThan(0);
	});

	it("prices an unpriced line at nothing and says so, rather than quoting its placeholder", async () => {
		const order = await placeOrder({
			items: [{ product_id: customCake, variant_id: size, qty: 1, note: "30th, about 12 people" }],
			pickupDate: await dateIn(5),
		});

		expect(order.total_cents).toBe(0);

		const items = await itemsOf(order.id);
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			line_total_cents: 0,
			pricing_note: "Price to follow",
			price_on_request: true,
			note: "30th, about 12 people",
		});

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("leaves the priced half of a mixed order alone", async () => {
		// The one that would have been quietly wrong: a cake with no price next to
		// cupcakes that have one. The total is the cupcakes, and the cake is still
		// on the order waiting to be priced.
		const order = await placeOrder({
			items: [
				{ product_id: customCake, variant_id: size, qty: 1, note: "Two tiers, ivory" },
				{ product_id: cupcakes, qty: 4 },
			],
			pickupDate: await dateIn(5),
		});

		// Four cupcakes is the seeded "4 for $12" bundle, and nothing else.
		expect(order.total_cents).toBe(1200);

		const items = await itemsOf(order.id);
		expect(items).toHaveLength(2);
		expect(items.find((item) => item.price_on_request)?.line_total_cents).toBe(0);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("keeps two cakes described differently as two lines", async () => {
		// The whole reason the brief moved onto the line. Under the old grouping
		// these were the same product, the same variant and no extras, so they
		// folded into one line of two: one cake with one description, and the
		// other brief gone.
		const order = await placeOrder({
			items: [
				{ product_id: customCake, variant_id: size, qty: 1, note: "Chocolate, for Sam" },
				{ product_id: customCake, variant_id: size, qty: 1, note: "Lemon, for Alex" },
			],
			pickupDate: await dateIn(5),
		});

		const items = await itemsOf(order.id);
		expect(items).toHaveLength(2);
		expect(items.map((item) => item.note)).toEqual(["Chocolate, for Sam", "Lemon, for Alex"]);
		expect(items.every((item) => item.qty === 1)).toBe(true);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("still folds two identical lines together, brief and all", async () => {
		// The other half of the same rule. Two of the same thing said the same way
		// is one line of two, exactly as it was before briefs existed, because the
		// browser prices it that way and the two must not disagree.
		const order = await placeOrder({
			items: [
				{ product_id: cupcakes, qty: 2, note: "No sprinkles" },
				{ product_id: cupcakes, qty: 2, note: "No sprinkles" },
			],
			pickupDate: await dateIn(5),
		});

		const items = await itemsOf(order.id);
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ qty: 4, note: "No sprinkles" });
		// Four together, so the bundle applies, which is the thing that would have
		// been mispriced had the two lines stayed apart.
		expect(order.total_cents).toBe(1200);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("keeps a described line apart from an identical undescribed one", async () => {
		const order = await placeOrder({
			items: [
				{ product_id: cupcakes, qty: 2, note: "No sprinkles" },
				{ product_id: cupcakes, qty: 2 },
			],
			pickupDate: await dateIn(5),
		});

		const items = await itemsOf(order.id);
		expect(items).toHaveLength(2);
		// `itemsOf` orders by `coalesce(note, '')`, so the undescribed one is first.
		expect(items.map((item) => item.note)).toEqual([null, "No sprinkles"]);
		expect(items.every((item) => item.qty === 2)).toBe(true);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("stores a line's photos and link against that line, in the order they were sent", async () => {
		const order = await placeOrder({
			items: [
				{
					product_id: customCake,
					variant_id: size,
					qty: 1,
					note: "  Like this one  ",
					inspiration_url: "  https://example.com/cake  ",
					inspiration_image_paths: ["a.webp", "b.webp"],
				},
			],
			pickupDate: await dateIn(5),
		});

		const items = await itemsOf(order.id);
		expect(items[0]).toMatchObject({
			// Trimmed against every whitespace class on the way in, the same as
			// every other free-text field on an order.
			note: "Like this one",
			inspiration_url: "https://example.com/cake",
		});
		// Not sorted: the order someone arranged their references in is part of
		// what they said.
		expect(items[0]!.inspiration_image_paths).toEqual(["a.webp", "b.webp"]);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("caps a line at three photos rather than refusing the order", async () => {
		const order = await placeOrder({
			items: [
				{
					product_id: customCake,
					variant_id: size,
					qty: 1,
					inspiration_image_paths: ["a.webp", "b.webp", "c.webp", "d.webp"],
				},
			],
			pickupDate: await dateIn(5),
		});

		const items = await itemsOf(order.id);
		expect(items[0]!.inspiration_image_paths).toEqual(["a.webp", "b.webp", "c.webp"]);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("treats a brief of nothing but whitespace as no brief at all", async () => {
		const order = await placeOrder({
			items: [{ product_id: cupcakes, qty: 4, note: "  \n\t  ", inspiration_url: "   " }],
			pickupDate: await dateIn(5),
		});

		const items = await itemsOf(order.id);
		expect(items[0]!.note).toBeNull();
		expect(items[0]!.inspiration_url).toBeNull();

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("marks the order as custom work from the line, not from an empty basket", async () => {
		const order = await placeOrder({
			items: [{ product_id: customCake, variant_id: size, qty: 1, note: "Anything" }],
			pickupDate: await dateIn(5),
		});

		const event = await db.query<{ data: { custom: boolean; photos: number } }>(
			"select data from order_events where order_id = $1 and type = 'created'",
			[order.id],
		);
		expect(event.rows[0]!.data.custom).toBe(true);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("goes on taking an ordinary order with no brief on it at all", async () => {
		// The regression that matters most: nearly every order is this one, and
		// nothing above may have changed it.
		const order = await placeOrder({
			items: [{ product_id: cupcakes, qty: 4 }],
			pickupDate: await dateIn(5),
		});

		expect(order.total_cents).toBe(1200);
		const items = await itemsOf(order.id);
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			qty: 4,
			line_total_cents: 1200,
			note: null,
			inspiration_url: null,
			price_on_request: false,
		});
		expect(items[0]!.inspiration_image_paths).toEqual([]);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("keeps an unpriced line's extras priced, because candles cost what candles cost", async () => {
		const extra = await db.query<{ id: string }>(
			`insert into product_extras (product_id, name, price_cents, sort_order)
			 values ($1, 'Sparklers', 400, 9) returning id`,
			[customCake],
		);
		const sparklers = extra.rows[0]!.id;

		const order = await placeOrder({
			items: [
				{ product_id: customCake, variant_id: size, qty: 2, extra_ids: [sparklers], note: "Two" },
			],
			pickupDate: await dateIn(5),
		});

		// The cake is nothing yet; two sets of sparklers are $8.
		expect(order.total_cents).toBe(800);
		const items = await itemsOf(order.id);
		expect(items[0]!.line_total_cents).toBe(0);

		await db.query("delete from orders where id = $1", [order.id]);
		await db.query("delete from product_extras where id = $1", [sparklers]);
	});

	it("snapshots price-on-request, so un-ticking it later cannot rewrite an order", async () => {
		const order = await placeOrder({
			items: [{ product_id: customCake, variant_id: size, qty: 1, note: "Something" }],
			pickupDate: await dateIn(5),
		});

		await db.query("update products set price_on_request = false where id = $1", [customCake]);
		const items = await itemsOf(order.id);
		expect(items[0]!.price_on_request).toBe(true);

		await db.query("update products set price_on_request = true where id = $1", [customCake]);
		await db.query("delete from orders where id = $1", [order.id]);
	});
});

/**
 * The starting prices a product priced on request shows instead of a price.
 *
 * The whole point of the table is that nothing reads it: it is what a customer
 * is told, not what anybody is charged. So what is worth asserting is that the
 * seed is there, that an order carrying the product it belongs to still comes
 * out at zero, and that the constraints keep the table readable.
 */
describe("the price guide", () => {
	let customCake: string;

	async function guideOf(slug: string) {
		const result = await db.query<{
			label: string;
			price_cents: number;
			is_addition: boolean;
		}>(
			`select g.label, g.price_cents, g.is_addition
			 from product_price_guide g
			 join products p on p.id = g.product_id
			 where p.slug = $1
			 order by g.sort_order`,
			[slug],
		);
		return result.rows;
	}

	beforeAll(async () => {
		await openEveryDay(50);
		customCake = await productId("custom-cake");
	});

	it("ships on the custom cake, in the order she gave, with the add-on last", async () => {
		expect(await guideOf("custom-cake")).toEqual([
			{ label: '6" - 2 layers', price_cents: 4500, is_addition: false },
			{ label: '6" - 3 layers', price_cents: 5500, is_addition: false },
			{ label: '8" - 2 layers', price_cents: 6500, is_addition: false },
			{ label: '8" - 3 layers', price_cents: 7500, is_addition: false },
			{ label: "Additional layers", price_cents: 1000, is_addition: true },
		]);
	});

	it("is answered by the picker, in the same words", async () => {
		// The page quoting "from $45" for a size nobody can then choose was the
		// whole complaint. Every priced line of the guide has a variant with the
		// same name; the two rows that are not priced are allowed to be extra.
		const result = await db.query<{ name: string }>(
			`select v.name from product_variants v
			 join products p on p.id = v.product_id
			 where p.slug = 'custom-cake'
			 order by v.sort_order`,
		);
		const sizes = result.rows.map((row) => row.name);

		const priced = (await guideOf("custom-cake"))
			.filter((row) => !row.is_addition)
			.map((row) => row.label);

		expect(priced.every((label) => sizes.includes(label))).toBe(true);
		expect(sizes).toEqual([
			'6" - 2 layers',
			'6" - 3 layers',
			'8" - 2 layers',
			'8" - 3 layers',
			"Two tiers",
			"Not sure yet",
		]);
	});

	// Her wording, not the one 20260917000001 seeded: 20260918000016 replaces it,
	// and this asserts the end of that pair rather than the middle of it.
	it("ships with the caveat that goes under it", async () => {
		const result = await db.query<{ price_guide_note: string | null }>(
			"select price_guide_note from products where slug = 'custom-cake'",
		);
		expect(result.rows[0]!.price_guide_note).toBe(
			"Custom designs & premium flavours may incur extra costs",
		);
	});

	it("is the only product that has one", async () => {
		// Seeded on the one product the request was about. A starting price on
		// anything else is a number the owner never agreed to publish.
		const result = await db.query<{ n: number }>(
			`select count(distinct g.product_id)::int as n
			 from product_price_guide g
			 join products p on p.id = g.product_id
			 where p.slug <> 'custom-cake'`,
		);
		expect(result.rows[0]!.n).toBe(0);
	});

	it("prices nothing: a custom cake with a guide still comes out at zero", async () => {
		const sizes = await db.query<{ id: string }>(
			"select id from product_variants where product_id = $1 order by sort_order limit 1",
			[customCake],
		);

		const order = await placeOrder({
			items: [{ product_id: customCake, variant_id: sizes.rows[0]!.id, qty: 1 }],
			pickupDate: await dateIn(7),
		});

		// Six inches and two layers says "from $45" on the page, and the order
		// still waits for her to quote it.
		expect(order.total_cents).toBe(0);
		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("refuses two lines with the same label on one product", async () => {
		const message = await errorOf(() =>
			db.query(
				`insert into product_price_guide (product_id, label, price_cents)
				 values ($1, '6" - 2 layers', 9900)`,
				[customCake],
			),
		);
		expect(message).toContain("product_price_guide_product_id_label_key");
	});

	it("goes when the product goes", async () => {
		const created = await db.query<{ id: string }>(
			`insert into products (name, slug, unit_price_cents, price_on_request)
			 values ('Dessert table', 'dessert-table', 0, true) returning id`,
		);
		const id = created.rows[0]!.id;

		await db.query(
			"insert into product_price_guide (product_id, label, price_cents) values ($1, 'Ten guests', 12000)",
			[id],
		);
		await db.query("delete from products where id = $1", [id]);

		const left = await db.query<{ n: number }>(
			"select count(*)::int as n from product_price_guide where product_id = $1",
			[id],
		);
		expect(left.rows[0]!.n).toBe(0);
	});
});

/**
 * A flavour of the customer's own, and what the frosting should be.
 *
 * The browser decides which of these questions to put; `place_order` decides
 * what reaches the order and whether two lines are one line, and those are the
 * decisions covered here. The browser's half of the same agreement — the same
 * lines folded, the same lines kept apart — is in lib/brief.test.ts.
 */
describe("a flavour of their own", () => {
	let cupcakes: string;

	async function itemsOf(orderId: string) {
		const result = await db.query<{
			qty: number;
			custom_flavour: string | null;
			frosting: string | null;
			frosting_matches_flavour: boolean;
		}>(
			`select qty, custom_flavour, frosting, frosting_matches_flavour
			 from order_items where order_id = $1
			 order by coalesce(custom_flavour, ''), coalesce(frosting, ''), qty`,
			[orderId],
		);
		return result.rows;
	}

	beforeAll(async () => {
		await openEveryDay(50);
		cupcakes = await productId("cupcakes");
	});

	it("switches the question on for the whole cupcakes category", async () => {
		const result = await db.query<{
			slug: string;
			wants_custom_flavour: boolean;
			wants_brief: boolean;
		}>(
			`select p.slug, p.wants_custom_flavour, p.wants_brief
			 from products p
			 join categories c on c.id = p.category_id
			 where c.slug = 'cupcakes'`,
		);

		expect(result.rows.length).toBeGreaterThan(0);
		for (const row of result.rows) {
			expect(row).toMatchObject({ wants_custom_flavour: true, wants_brief: true });
		}
	});

	it("leaves every other product asking nothing of the kind", async () => {
		const result = await db.query<{ count: number }>(
			`select count(*)::int as count
			 from products p
			 where p.wants_custom_flavour
			   and p.category_id is distinct from (select id from categories where slug = 'cupcakes')`,
		);

		expect(result.rows[0]!.count).toBe(0);
	});

	it("carries the flavour and the frosting onto the line", async () => {
		const order = await placeOrder({
			items: [
				{ product_id: cupcakes, qty: 4, custom_flavour: "  Pandan  ", frosting: "Pale pink" },
			],
			pickupDate: await dateIn(5),
		});

		// Four cupcakes is still the seeded "4 for $12": asking for pandan does
		// not change what the menu charges. What it may cost extra is the owner's
		// judgement, and it goes in `quote_cents`.
		expect(order.total_cents).toBe(1200);

		expect(await itemsOf(order.id)).toEqual([
			{
				qty: 4,
				custom_flavour: "Pandan",
				frosting: "Pale pink",
				frosting_matches_flavour: false,
			},
		]);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("lets the tick box win over a frosting sent alongside it", async () => {
		// One answer to one question. A caller that sends both is not refused —
		// it is a browser that got ahead of itself, not an attack — but only one
		// of the two reaches the order, and it is the one that was ticked.
		const order = await placeOrder({
			items: [
				{
					product_id: cupcakes,
					qty: 4,
					custom_flavour: "Pandan",
					frosting: "Pale pink",
					frosting_matches_flavour: true,
				},
			],
			pickupDate: await dateIn(5),
		});

		expect(await itemsOf(order.id)).toEqual([
			{ qty: 4, custom_flavour: "Pandan", frosting: null, frosting_matches_flavour: true },
		]);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("folds a line that sent both into the line that sent only the tick", async () => {
		// The grouping runs on the normalised pair, so these are one line of
		// eight rather than two of four. Left ungrouped, the bundle price would
		// apply twice here and once in the browser, and the two totals would
		// disagree.
		const order = await placeOrder({
			items: [
				{ product_id: cupcakes, qty: 4, frosting: "Pale pink", frosting_matches_flavour: true },
				{ product_id: cupcakes, qty: 4, frosting_matches_flavour: true },
			],
			pickupDate: await dateIn(5),
		});

		expect(await itemsOf(order.id)).toEqual([
			{ qty: 8, custom_flavour: null, frosting: null, frosting_matches_flavour: true },
		]);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("keeps two flavours as two lines", async () => {
		// Two batches to bake. Under the old grouping these were the same product
		// with no variant and no extras, so they folded into one line of eight and
		// one of the two flavours was simply gone.
		const order = await placeOrder({
			items: [
				{ product_id: cupcakes, qty: 4, custom_flavour: "Pandan" },
				{ product_id: cupcakes, qty: 4, custom_flavour: "Ube" },
			],
			pickupDate: await dateIn(5),
		});

		const items = await itemsOf(order.id);
		expect(items).toHaveLength(2);
		expect(items.map((item) => item.custom_flavour)).toEqual(["Pandan", "Ube"]);
		// Each line is priced as four, so each gets the bundle. That is the same
		// arithmetic the basket did, which is the point.
		expect(order.total_cents).toBe(2400);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("keeps a line with no flavour folding together exactly as before", async () => {
		// The compatibility case, and the one most orders are: nothing asked, one
		// line, the price it always was.
		const order = await placeOrder({
			items: [
				{ product_id: cupcakes, qty: 2 },
				{ product_id: cupcakes, qty: 2 },
			],
			pickupDate: await dateIn(5),
		});

		expect(await itemsOf(order.id)).toEqual([
			{ qty: 4, custom_flavour: null, frosting: null, frosting_matches_flavour: false },
		]);
		expect(order.total_cents).toBe(1200);

		await db.query("delete from orders where id = $1", [order.id]);
	});

	it("refuses a row that gives two answers about one frosting", async () => {
		// `place_order` already blanks one of them. This is the promise underneath
		// that: nothing can put a row in this table saying the frosting is pale
		// pink *and* whatever the flavour is.
		const order = await placeOrder({
			items: [{ product_id: cupcakes, qty: 4, frosting_matches_flavour: true }],
			pickupDate: await dateIn(5),
		});

		const error = await errorOf(() =>
			db.query("update order_items set frosting = 'Pale pink' where order_id = $1", [order.id]),
		);
		expect(error).toMatch(/order_items_frosting_is_one_answer/);

		await db.query("delete from orders where id = $1", [order.id]);
	});
});

describe("more photos than one", () => {
	it("starts every product with none, which is what the page draws no strip for", async () => {
		const result = await db.query<{ gallery_image_paths: string[] }>(
			"select gallery_image_paths from products",
		);
		expect(result.rows.every((row) => row.gallery_image_paths.length === 0)).toBe(true);
	});

	it("keeps them in the order they were given", async () => {
		const id = await productId("cupcakes");
		await db.query("update products set gallery_image_paths = $2 where id = $1", [
			id,
			["cupcakes/side.webp", "cupcakes/one.webp"],
		]);

		const result = await db.query<{ gallery_image_paths: string[] }>(
			"select gallery_image_paths from products where id = $1",
			[id],
		);
		expect(result.rows[0]!.gallery_image_paths).toEqual([
			"cupcakes/side.webp",
			"cupcakes/one.webp",
		]);

		await db.query("update products set gallery_image_paths = '{}' where id = $1", [id]);
	});

	it("takes a full twenty five, which is the number the admin offers up to", async () => {
		const id = await productId("cupcakes");
		const full = Array.from({ length: 25 }, (_, index) => `cupcakes/${index}.webp`);

		await db.query("update products set gallery_image_paths = $2 where id = $1", [id, full]);

		const result = await db.query<{ gallery_image_paths: string[] }>(
			"select gallery_image_paths from products where id = $1",
			[id],
		);
		expect(result.rows[0]!.gallery_image_paths).toHaveLength(25);

		await db.query("update products set gallery_image_paths = '{}' where id = $1", [id]);
	});

	it("refuses a twenty sixth, which is the number the admin stops offering at", async () => {
		const id = await productId("cupcakes");
		const tooMany = Array.from({ length: 26 }, (_, index) => `cupcakes/${index}.webp`);

		const message = await errorOf(() =>
			db.query("update products set gallery_image_paths = $2 where id = $1", [id, tooMany]),
		);
		expect(message).toMatch(/gallery_image_paths/);
	});

	it("refuses a hole in the list, which is a photo nothing could show", async () => {
		const id = await productId("cupcakes");

		const message = await errorOf(() =>
			db.query("update products set gallery_image_paths = $2 where id = $1", [
				id,
				["cupcakes/side.webp", null],
			]),
		);
		expect(message).toMatch(/gallery_image_paths/);
	});
});
