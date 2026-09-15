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
	items: Array<{ product_id: string; variant_id?: string; qty: number }>;
	pickupDate: string;
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
	}>("select * from place_order($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)", [
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
		]);
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

	it("leaves the owner's own questions alone when the migration is re-applied", async () => {
		const migration = await import("node:fs/promises").then((fs) =>
			fs.readFile("supabase/migrations/20260915000006_faqs.sql", "utf8"),
		);
		// Everything after the table itself: re-running the create would fail on
		// the table already existing, which is not what is under test here.
		const reseed = migration.slice(migration.indexOf("insert into faqs"));
		await db.exec(reseed);

		const result = await db.query<{ count: number }>("select count(*)::int as count from faqs");
		expect(result.rows[0]!.count).toBe(5);
	});

	it("ships no reviews at all", async () => {
		// Deliberate, and worth a test so that a later "helpful" seed has to argue
		// with this line first: a placeholder review is a sentence attributed to
		// someone who never said it, on a real bakery's public page.
		const result = await db.query<{ count: number }>("select count(*)::int as count from reviews");
		expect(result.rows[0]!.count).toBe(0);
	});

	it("is idempotent", async () => {
		const seed = await import("node:fs/promises").then((fs) =>
			fs.readFile("supabase/seed.sql", "utf8"),
		);
		await db.exec(seed);
		const result = await db.query<{ count: number }>("select count(*)::int as count from products");
		expect(result.rows[0]!.count).toBe(5);
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
		const message = await errorOf(() =>
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
 * A product that asks two questions rather than one: three flavours by two
 * layer counts, priced one combination at a time.
 *
 * The flat-variant tests above are the other half of this. Nothing there has a
 * row in any of these tables, and the fact that they still pass unchanged is
 * the point: asking a second question is something a product opts into, not
 * something every product had done to it.
 */
describe("variants made of several answers", () => {
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

	/** A priced combination, linked to the answers it is made of. */
	async function makeVariant(name: string, cents: number, answers: string[]): Promise<string> {
		const created = await db.query<{ id: string }>(
			`insert into product_variants (product_id, name, unit_price_cents) values ($1, $2, $3)
			 returning id`,
			[cakeId, name, cents],
		);
		const variantId = created.rows[0]!.id;

		for (const answer of answers) {
			await db.query(
				`insert into product_variant_options (variant_id, group_id, option_id)
				 select $1, o.group_id, o.id from product_options o where o.id = $2`,
				[variantId, answer],
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

	it("takes every combination of an answer down when the answer sells out", async () => {
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

	it("refuses a combination that answers one question twice", async () => {
		const message = await errorOf(async () =>
			db.query(
				`insert into product_variant_options (variant_id, group_id, option_id)
				 values ($1, $2, $3)`,
				[variantIds.carrotTwo, flavourGroup, optionIds.chocolate],
			),
		);
		expect(message).toContain("product_variant_options_pkey");
	});

	it("refuses an answer filed under a question it does not belong to", async () => {
		// Half-built on purpose: a combination that already answered the layers
		// question would trip the key above before the foreign key was reached.
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

	it("stops selling a combination that has lost one of its answers", async () => {
		const lemon = await makeOption(flavourGroup, "Lemon", 9);
		const lemonTwo = await makeVariant("Lemon · 2 layers", 4800, [lemon, optionIds.two!]);

		await db.query("delete from product_options where id = $1", [lemon]);

		// Deleting the answer takes the link to it and nothing else, so the
		// combination is still here, still switched on, and now answers one of the
		// two questions the product asks.
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

	it("takes the whole question down with the product", async () => {
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

	it("carries a combination name longer than a single answer's onto the order", async () => {
		// Two 60-character answers joined is 123 characters, which is what the
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
