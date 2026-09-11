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
	items: Array<{ product_id: string; qty: number }>;
	pickupDate: string;
	fulfilment?: "pickup" | "delivery";
	name?: string;
	email?: string;
	phone?: string;
	address?: string | null;
	notes?: string | null;
	custom?: string | null;
	ipHash?: string | null;
};

async function placeOrder(args: PlaceArgs) {
	const result = await db.query<{
		id: string;
		token: string;
		reference: string;
		total_cents: number;
	}>("select * from place_order($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)", [
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
				unit_price_cents: 250,
				unit_label: "each",
				qty_step: 2,
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

	it("prices cookies from the unit price they are stepped in", async () => {
		expect((await price("cookies", 2)).total_cents).toBe(500);
		expect((await price("cookies", 6)).total_cents).toBe(1500);
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

		expect(order.total_cents).toBe(2000);
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
				line_total_cents: 500,
				pricing_note: "2 x $2.50 each",
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

	it("enforces max_per_order across split lines", async () => {
		const cupcakes = await productId("cupcakes");
		await db.query("update products set max_per_order = 6 where id = $1", [cupcakes]);

		const date = await dateIn(7);
		const message = await errorOf(() =>
			placeOrder({
				items: [
					{ product_id: cupcakes, qty: 4 },
					{ product_id: cupcakes, qty: 4 },
				],
				pickupDate: date,
			}),
		);
		expect(message).toContain("QTY_INVALID");

		await db.query("update products set max_per_order = null where id = $1", [cupcakes]);
	});

	it("rejects a quantity that does not match the product's step", async () => {
		const message = await errorOf(async () =>
			placeOrder({
				items: [{ product_id: await productId("cookies"), qty: 3 }],
				pickupDate: await dateIn(7),
			}),
		);
		expect(message).toContain("QTY_INVALID");
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
		expect(order.total_cents).toBe(500);
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
