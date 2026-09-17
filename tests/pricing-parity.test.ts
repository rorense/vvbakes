/**
 * lib/pricing.ts exists so the order form can show a running total. The database
 * is what actually charges. If they disagree, a customer sees one price and pays
 * another, which is the worst class of bug this project can have.
 *
 * This runs both implementations over a spread of tier shapes and every quantity
 * up to 40 and asserts they agree on the cent and on the wording.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { priceForQty } from "../lib/pricing";
import type { PriceTier } from "../lib/types";
import { createTestDb, type TestDb } from "./pg";

let db: TestDb;
let productId: string;

const CASES: Array<{
	name: string;
	unitPriceCents: number;
	unitLabel: string;
	tiers: PriceTier[];
}> = [
	{ name: "no tiers", unitPriceCents: 500, unitLabel: "slice", tiers: [] },
	{
		name: "one tier at the same unit rate (cupcakes)",
		unitPriceCents: 300,
		unitLabel: "each",
		tiers: [{ qty: 4, priceCents: 1200 }],
	},
	{
		name: "one tier that genuinely discounts",
		unitPriceCents: 300,
		unitLabel: "each",
		tiers: [{ qty: 6, priceCents: 1500 }],
	},
	{
		name: "two tiers where the smaller one is the better rate",
		unitPriceCents: 300,
		unitLabel: "each",
		tiers: [
			{ qty: 4, priceCents: 1200 },
			{ qty: 3, priceCents: 800 },
		],
	},
	{
		name: "three overlapping tiers",
		unitPriceCents: 450,
		unitLabel: "each",
		tiers: [
			{ qty: 2, priceCents: 850 },
			{ qty: 5, priceCents: 2000 },
			{ qty: 12, priceCents: 4500 },
		],
	},
	{
		name: "awkward prices that do not divide evenly",
		unitPriceCents: 333,
		unitLabel: "each",
		tiers: [
			{ qty: 3, priceCents: 999 },
			{ qty: 7, priceCents: 2222 },
		],
	},
	{
		name: "a free item",
		unitPriceCents: 0,
		unitLabel: "each",
		tiers: [],
	},
];

beforeAll(async () => {
	db = await createTestDb({ seed: false });
	await db.exec(`
		insert into site_settings (id) values (1);
		insert into categories (name, slug) values ('Test', 'test');
	`);
	const result = await db.query<{ id: string }>(
		`insert into products (name, slug, unit_price_cents, unit_label)
		 values ('Parity', 'parity', 100, 'each') returning id`,
	);
	productId = result.rows[0]!.id;
}, 180_000);

afterAll(async () => {
	await db?.close();
});

describe("lib/pricing.ts agrees with price_for_qty on a variant", () => {
	// A flavour priced away from the product's own price is where the two
	// implementations could most easily drift: the database starts its dynamic
	// program from the variant's price while the browser starts from whatever
	// the form handed it, and the bundle tiers stay the product's in both.
	const VARIANT_PRICES = [0, 275, 4500, 5500];

	it("prices every flavour the same way the browser does", async () => {
		await db.query("update products set unit_price_cents = 300, unit_label = $2 where id = $1", [
			productId,
			"cake",
		]);
		await db.query("delete from product_price_tiers where product_id = $1", [productId]);
		await db.query(
			"insert into product_price_tiers (product_id, qty, price_cents) values ($1, 2, 800), ($1, 5, 1800)",
			[productId],
		);

		const tiers: PriceTier[] = [
			{ qty: 2, priceCents: 800 },
			{ qty: 5, priceCents: 1800 },
		];
		const mismatches: string[] = [];

		for (const priceCents of VARIANT_PRICES) {
			const inserted = await db.query<{ id: string }>(
				`insert into product_variants (product_id, name, unit_price_cents)
				 values ($1, $2, $3) returning id`,
				[productId, `Flavour ${priceCents}`, priceCents],
			);
			const variantId = inserted.rows[0]!.id;

			for (let qty = 1; qty <= 20; qty += 1) {
				const sql = await db.query<{ total_cents: number; note: string }>(
					"select total_cents, note from price_for_qty($1, $2, $3)",
					[productId, qty, variantId],
				);
				const fromDb = sql.rows[0]!;
				const fromTs = priceForQty(priceCents, tiers, qty, "cake");

				if (fromDb.total_cents !== fromTs.totalCents) {
					mismatches.push(
						`${priceCents}c x ${qty}: database charges ${fromDb.total_cents}, form showed ${fromTs.totalCents}`,
					);
				}
				if (fromDb.note !== fromTs.note) {
					mismatches.push(`${priceCents}c x ${qty}: note "${fromDb.note}" vs "${fromTs.note}"`);
				}
			}
		}

		expect(mismatches).toEqual([]);

		await db.query("delete from product_variants where product_id = $1", [productId]);
		await db.query("delete from product_price_tiers where product_id = $1", [productId]);
	});
});

/**
 * The other kind of price list: a rate for the first few and a cheaper one for
 * everything after. Its own block because the two implementations have to agree
 * on where the cheaper rate starts as well as on the arithmetic, and that is
 * worked out from `min_per_order` and `qty_step` at both ends rather than
 * stored.
 */
describe("lib/pricing.ts agrees with price_for_qty on a price after the minimum", () => {
	const AFTER: Array<{
		name: string;
		unitPriceCents: number;
		unitLabel: string;
		qtyStep: number;
		minPerOrder: number | null;
		extraUnitPriceCents: number;
	}> = [
		{
			name: "mini cupcakes: two boxes at $17.50, then $15",
			unitPriceCents: 1750,
			unitLabel: "box of 12",
			qtyStep: 1,
			minPerOrder: 2,
			extraUnitPriceCents: 1500,
		},
		{
			name: "no minimum at all, so the first one is the dear one",
			unitPriceCents: 1750,
			unitLabel: "each",
			qtyStep: 1,
			minPerOrder: null,
			extraUnitPriceCents: 1500,
		},
		{
			name: "a minimum that is not a whole number of steps",
			unitPriceCents: 900,
			unitLabel: "pack",
			qtyStep: 4,
			minPerOrder: 8,
			extraUnitPriceCents: 750,
		},
		{
			name: "a step above one with no minimum",
			unitPriceCents: 500,
			unitLabel: "pack",
			qtyStep: 3,
			minPerOrder: null,
			extraUnitPriceCents: 400,
		},
		{
			name: "free after the first few",
			unitPriceCents: 1200,
			unitLabel: "each",
			qtyStep: 1,
			minPerOrder: 3,
			extraUnitPriceCents: 0,
		},
		{
			name: "dearer after the minimum, which is allowed and should still agree",
			unitPriceCents: 400,
			unitLabel: "each",
			qtyStep: 1,
			minPerOrder: 2,
			extraUnitPriceCents: 650,
		},
	];

	for (const testCase of AFTER) {
		it(testCase.name, async () => {
			await db.query(
				`update products
				 set unit_price_cents = $1, unit_label = $2, qty_step = $3,
				     min_per_order = $4, extra_unit_price_cents = $5
				 where id = $6`,
				[
					testCase.unitPriceCents,
					testCase.unitLabel,
					testCase.qtyStep,
					testCase.minPerOrder,
					testCase.extraUnitPriceCents,
					productId,
				],
			);

			// The same rounding `minOrderQty` does, spelled out here rather than
			// imported, so a change to it has to be made twice on purpose instead
			// of agreeing with itself by construction.
			const minimum =
				testCase.minPerOrder === null
					? testCase.qtyStep
					: Math.max(
							testCase.qtyStep,
							Math.ceil(testCase.minPerOrder / testCase.qtyStep) * testCase.qtyStep,
						);

			const mismatches: string[] = [];

			for (let qty = 1; qty <= 40; qty += 1) {
				const sql = await db.query<{ total_cents: number; note: string }>(
					"select total_cents, note from price_for_qty($1, $2)",
					[productId, qty],
				);
				const fromDb = sql.rows[0]!;
				const fromTs = priceForQty(testCase.unitPriceCents, [], qty, testCase.unitLabel, {
					minimum,
					unitPriceCents: testCase.extraUnitPriceCents,
				});

				if (fromDb.total_cents !== fromTs.totalCents) {
					mismatches.push(
						`qty ${qty}: database charges ${fromDb.total_cents}, form showed ${fromTs.totalCents}`,
					);
				}
				if (fromDb.note !== fromTs.note) {
					mismatches.push(`qty ${qty}: note "${fromDb.note}" vs "${fromTs.note}"`);
				}
			}

			expect(mismatches).toEqual([]);
		});
	}

	afterAll(async () => {
		// The blocks below share this row and expect it back the way they found
		// it; a rate left on it would reprice every one of their quantities.
		await db?.query(
			"update products set extra_unit_price_cents = null, min_per_order = null, qty_step = 1 where id = $1",
			[productId],
		);
	});
});

describe("lib/pricing.ts agrees with price_for_qty", () => {
	for (const testCase of CASES) {
		it(testCase.name, async () => {
			await db.query("update products set unit_price_cents = $1, unit_label = $2 where id = $3", [
				testCase.unitPriceCents,
				testCase.unitLabel,
				productId,
			]);
			await db.query("delete from product_price_tiers where product_id = $1", [productId]);
			for (const tier of testCase.tiers) {
				await db.query(
					"insert into product_price_tiers (product_id, qty, price_cents) values ($1, $2, $3)",
					[productId, tier.qty, tier.priceCents],
				);
			}

			const mismatches: string[] = [];

			for (let qty = 1; qty <= 40; qty += 1) {
				const sql = await db.query<{ total_cents: number; note: string }>(
					"select total_cents, note from price_for_qty($1, $2)",
					[productId, qty],
				);
				const fromDb = sql.rows[0]!;
				const fromTs = priceForQty(
					testCase.unitPriceCents,
					testCase.tiers,
					qty,
					testCase.unitLabel,
				);

				if (fromDb.total_cents !== fromTs.totalCents) {
					mismatches.push(
						`qty ${qty}: database charges ${fromDb.total_cents}, form showed ${fromTs.totalCents}`,
					);
				}
				if (fromDb.note !== fromTs.note) {
					mismatches.push(`qty ${qty}: note "${fromDb.note}" vs "${fromTs.note}"`);
				}
			}

			expect(mismatches).toEqual([]);
		});
	}
});
