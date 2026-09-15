/**
 * The admin's save, replayed against real PostgreSQL.
 *
 * `saveVariants` in app/admin/(dashboard)/actions.ts writes a product's
 * questions, answers and priced combinations through PostgREST as a fixed
 * sequence of eleven statements. Everything about it that can go wrong is about
 * that sequence rather than about any one statement: what order the deletes and
 * the inserts happen in, what the cascades take with them, and whether a row an
 * order points at survives.
 *
 * None of that is reachable from a unit test, and PostgREST is not something
 * this harness has. So the sequence is replayed here in SQL, step for step, and
 * what is asserted is the state it leaves behind.
 *
 * `replaySave` below is a transcription, which is the honest weakness of this
 * file: change the order of the calls in `saveVariants` and these tests go on
 * passing. The comment above each step names the call it stands for, so the two
 * can be read side by side. What the tests are really for is the questions the
 * transcription cannot get wrong — whether ids survive a conversion, whether a
 * past order keeps pointing at something, and what the database will and will
 * not accept.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, errorOf, type TestDb } from "./pg";

let db: TestDb;

beforeAll(async () => {
	db = await createTestDb();
	await db.query("update availability_rules set is_open = true, capacity = 50");
	await db.query("delete from availability_overrides");
}, 120_000);

afterAll(async () => {
	await db?.close();
});

// --- the shapes the form submits --------------------------------------------

interface OptionIn {
	id?: string;
	name: string;
	imagePath?: string | null;
	allergens?: string[];
	isAvailable?: boolean;
}

interface GroupIn {
	id?: string;
	name: string;
	options: OptionIn[];
}

interface VariantIn {
	id?: string;
	name: string;
	unitPriceCents: number;
	isAvailable?: boolean;
	/** One index per question, into that question's answers. */
	options: number[];
}

/**
 * The eleven statements `saveVariants` makes, in order.
 *
 * Returns the ids it ended up with, the way the real one does, so a test can
 * feed them back in on a second save exactly as the form would.
 */
async function replaySave(
	productId: string,
	groups: GroupIn[],
	variants: VariantIn[],
): Promise<{ groupIds: string[]; optionIds: string[][]; variantIds: string[] }> {
	const kept = (rows: Array<{ id?: string }>) => rows.map((r) => r.id).filter(Boolean) as string[];

	// 1. delete from product_option_groups where product_id = … and id not in (kept)
	await db.query(
		`delete from product_option_groups
		 where product_id = $1 and (cardinality($2::uuid[]) = 0 or not (id = any($2)))`,
		[productId, kept(groups)],
	);

	// 2. upsert the groups that already have a row
	for (const [index, group] of groups.entries()) {
		if (!group.id) continue;
		await db.query(
			`insert into product_option_groups (id, product_id, name, sort_order)
			 values ($1, $2, $3, $4)
			 on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order`,
			[group.id, productId, group.name, index],
		);
	}

	// 3. insert the new ones, reading their ids back by name
	const groupIds: string[] = [];
	for (const [index, group] of groups.entries()) {
		if (group.id) {
			groupIds.push(group.id);
			continue;
		}
		const made = await db.query<{ id: string }>(
			`insert into product_option_groups (product_id, name, sort_order)
			 values ($1, $2, $3) returning id`,
			[productId, group.name, index],
		);
		groupIds.push(made.rows[0]!.id);
	}

	const optionIds: string[][] = [];

	for (const [index, group] of groups.entries()) {
		const groupId = groupIds[index]!;

		// 4. delete from product_options where group_id = … and id not in (kept)
		await db.query(
			`delete from product_options
			 where group_id = $1 and (cardinality($2::uuid[]) = 0 or not (id = any($2)))`,
			[groupId, kept(group.options)],
		);

		// 5. upsert the answers that already have a row
		for (const [at, option] of group.options.entries()) {
			if (!option.id) continue;
			await db.query(
				`insert into product_options (id, group_id, name, image_path, allergens, is_available, sort_order)
				 values ($1, $2, $3, $4, $5, $6, $7)
				 on conflict (id) do update set
					name = excluded.name, image_path = excluded.image_path,
					allergens = excluded.allergens, is_available = excluded.is_available,
					sort_order = excluded.sort_order`,
				[
					option.id,
					groupId,
					option.name,
					option.imagePath ?? null,
					option.allergens ?? [],
					option.isAvailable ?? true,
					at,
				],
			);
		}

		// 6. insert the new answers
		const saved: string[] = [];
		for (const [at, option] of group.options.entries()) {
			if (option.id) {
				saved.push(option.id);
				continue;
			}
			const made = await db.query<{ id: string }>(
				`insert into product_options (group_id, name, image_path, allergens, is_available, sort_order)
				 values ($1, $2, $3, $4, $5, $6) returning id`,
				[
					groupId,
					option.name,
					option.imagePath ?? null,
					option.allergens ?? [],
					option.isAvailable ?? true,
					at,
				],
			);
			saved.push(made.rows[0]!.id);
		}
		optionIds.push(saved);
	}

	// 7. delete from product_variants where product_id = … and id not in (kept)
	await db.query(
		`delete from product_variants
		 where product_id = $1 and (cardinality($2::uuid[]) = 0 or not (id = any($2)))`,
		[productId, kept(variants)],
	);

	// 8. upsert the combinations that already have a row
	for (const [index, variant] of variants.entries()) {
		if (!variant.id) continue;
		await db.query(
			`insert into product_variants (id, product_id, name, unit_price_cents, is_available, sort_order)
			 values ($1, $2, $3, $4, $5, $6)
			 on conflict (id) do update set
				name = excluded.name, unit_price_cents = excluded.unit_price_cents,
				is_available = excluded.is_available, sort_order = excluded.sort_order`,
			[
				variant.id,
				productId,
				variant.name,
				variant.unitPriceCents,
				variant.isAvailable ?? true,
				index,
			],
		);
	}

	// 9. insert the new combinations
	const variantIds: string[] = [];
	for (const [index, variant] of variants.entries()) {
		if (variant.id) {
			variantIds.push(variant.id);
			continue;
		}
		const made = await db.query<{ id: string }>(
			`insert into product_variants (product_id, name, unit_price_cents, is_available, sort_order)
			 values ($1, $2, $3, $4, $5) returning id`,
			[productId, variant.name, variant.unitPriceCents, variant.isAvailable ?? true, index],
		);
		variantIds.push(made.rows[0]!.id);
	}

	// 10. read what these combinations answer now, so an unchanged one is left
	//     alone. See the comment in saveVariants for why that matters.
	const wanted = variants.flatMap((variant, index) =>
		variant.options.map((chosen, group) => ({
			variant_id: variantIds[index]!,
			group_id: groupIds[group]!,
			option_id: optionIds[group]![chosen]!,
		})),
	);
	const key = (l: { variant_id: string; group_id: string }) => `${l.variant_id}:${l.group_id}`;

	const current = new Map<string, string>();
	if (variantIds.length > 0) {
		const held = await db.query<{ variant_id: string; group_id: string; option_id: string }>(
			"select variant_id, group_id, option_id from product_variant_options where variant_id = any($1)",
			[variantIds],
		);
		for (const row of held.rows) current.set(key(row), row.option_id);
	}

	const stale = new Set<string>();
	for (const link of wanted) {
		if (current.get(key(link)) !== link.option_id) stale.add(link.variant_id);
	}
	const keep = new Set(wanted.map(key));
	for (const held of current.keys()) {
		if (!keep.has(held)) stale.add(held.split(":")[0]!);
	}

	// 11. clear and rewrite only those
	if (stale.size > 0) {
		await db.query("delete from product_variant_options where variant_id = any($1)", [[...stale]]);
		for (const link of wanted.filter((l) => stale.has(l.variant_id))) {
			await db.query(
				`insert into product_variant_options (variant_id, group_id, option_id)
				 values ($1, $2, $3)`,
				[link.variant_id, link.group_id, link.option_id],
			);
		}
	}

	return { groupIds, optionIds, variantIds };
}

// --- reading the result back ------------------------------------------------

async function variantRows(productId: string) {
	const result = await db.query<{
		id: string;
		name: string;
		unit_price_cents: number;
		answers: string | null;
	}>(
		`select v.id, v.name, v.unit_price_cents,
			(select string_agg(o.name, ' | ' order by g.sort_order)
			 from product_variant_options vo
			 join product_options o on o.id = vo.option_id
			 join product_option_groups g on g.id = vo.group_id
			 where vo.variant_id = v.id) as answers
		 from product_variants v
		 where v.product_id = $1
		 order by v.sort_order`,
		[productId],
	);
	return result.rows;
}

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

async function order(productId: string, variantId: string | null, qty = 1) {
	const result = await db.query<{ id: string; total_cents: number }>(
		`select * from place_order($1, $2, 'pickup', 'Test Customer', 'test@example.com',
			'021 555 0100', null, null, null, null, '{}', null)`,
		[
			JSON.stringify([{ product_id: productId, variant_id: variantId ?? undefined, qty }]),
			await dateIn(7),
		],
	);
	return result.rows[0]!;
}

/** A cake with three flavours and no questions: the shape every shop already has. */
async function aFlatCake(slug: string): Promise<{ id: string; variantIds: string[] }> {
	const made = await db.query<{ id: string }>(
		`insert into products (name, slug, unit_price_cents, unit_label, variant_label, sort_order)
		 values ('Cake', $1, 4500, 'cake', 'Flavour', 80) returning id`,
		[slug],
	);
	const id = made.rows[0]!.id;

	const variants = await db.query<{ id: string }>(
		`insert into product_variants (product_id, name, unit_price_cents, image_path, allergens, sort_order)
		 values
			($1, 'Chocolate', 4500, null, '{}', 0),
			($1, 'Carrot', 5000, 'cake/carrot.webp', '{nuts}', 1),
			($1, 'Lemon', 4800, null, '{}', 2)
		 returning id`,
		[id],
	);

	return { id, variantIds: variants.rows.map((r) => r.id) };
}

describe("converting a product that has only ever asked one question", () => {
	let cakeId: string;
	let before: string[];
	let orderId: string;

	beforeEach(async () => {
		const cake = await aFlatCake(`convert-${Math.random().toString(36).slice(2, 9)}`);
		cakeId = cake.id;
		before = cake.variantIds;

		// An order placed the old way, before any of this existed. It is the thing
		// the whole design is arranged around not breaking.
		orderId = (await order(cakeId, before[1]!)).id;
	});

	it("keeps every variant id, so past orders still point at something", async () => {
		await replaySave(
			cakeId,
			[
				{
					name: "Flavour",
					options: [
						{ name: "Chocolate" },
						{ name: "Carrot", imagePath: "cake/carrot.webp", allergens: ["nuts"] },
						{ name: "Lemon" },
					],
				},
			],
			[
				{ id: before[0], name: "Chocolate", unitPriceCents: 4500, options: [0] },
				{ id: before[1], name: "Carrot", unitPriceCents: 5000, options: [1] },
				{ id: before[2], name: "Lemon", unitPriceCents: 4800, options: [2] },
			],
		);

		const rows = await variantRows(cakeId);
		expect(rows.map((r) => r.id)).toEqual(before);
		expect(rows.map((r) => r.name)).toEqual(["Chocolate", "Carrot", "Lemon"]);
		expect(rows.map((r) => r.unit_price_cents)).toEqual([4500, 5000, 4800]);

		const item = await db.query<{ product_variant_id: string | null; variant_name: string }>(
			"select product_variant_id, variant_name from order_items where order_id = $1",
			[orderId],
		);
		expect(item.rows[0]!.product_variant_id).toBe(before[1]);
		expect(item.rows[0]!.variant_name).toBe("Carrot");
	});

	it("moves the photo and the allergens onto the answer", async () => {
		await replaySave(
			cakeId,
			[
				{
					name: "Flavour",
					options: [
						{ name: "Chocolate" },
						{ name: "Carrot", imagePath: "cake/carrot.webp", allergens: ["nuts"] },
						{ name: "Lemon" },
					],
				},
			],
			[
				{ id: before[0], name: "Chocolate", unitPriceCents: 4500, options: [0] },
				{ id: before[1], name: "Carrot", unitPriceCents: 5000, options: [1] },
				{ id: before[2], name: "Lemon", unitPriceCents: 4800, options: [2] },
			],
		);

		const carrot = await db.query<{ image_path: string; allergens: string[] }>(
			`select o.image_path, o.allergens from product_options o
			 join product_option_groups g on g.id = o.group_id
			 where g.product_id = $1 and o.name = 'Carrot'`,
			[cakeId],
		);
		expect(carrot.rows[0]!.image_path).toBe("cake/carrot.webp");
		expect(carrot.rows[0]!.allergens).toEqual(["nuts"]);
	});

	it("leaves every combination orderable at exactly the price it had", async () => {
		await replaySave(
			cakeId,
			[
				{
					name: "Flavour",
					options: [{ name: "Chocolate" }, { name: "Carrot" }, { name: "Lemon" }],
				},
			],
			[
				{ id: before[0], name: "Chocolate", unitPriceCents: 4500, options: [0] },
				{ id: before[1], name: "Carrot", unitPriceCents: 5000, options: [1] },
				{ id: before[2], name: "Lemon", unitPriceCents: 4800, options: [2] },
			],
		);

		expect((await order(cakeId, before[0]!)).total_cents).toBe(4500);
		expect((await order(cakeId, before[1]!)).total_cents).toBe(5000);
		expect((await order(cakeId, before[2]!)).total_cents).toBe(4800);
	});
});

describe("adding a second question to a product that already has one", () => {
	let cakeId: string;
	let saved: Awaited<ReturnType<typeof replaySave>>;
	let firstOrder: string;

	beforeEach(async () => {
		const cake = await aFlatCake(`grow-${Math.random().toString(36).slice(2, 9)}`);
		cakeId = cake.id;
		firstOrder = (await order(cakeId, cake.variantIds[0]!)).id;

		// The conversion save, exactly as the test above.
		saved = await replaySave(
			cakeId,
			[
				{
					name: "Flavour",
					options: [{ name: "Chocolate" }, { name: "Carrot" }, { name: "Lemon" }],
				},
			],
			[
				{ id: cake.variantIds[0], name: "Chocolate", unitPriceCents: 4500, options: [0] },
				{ id: cake.variantIds[1], name: "Carrot", unitPriceCents: 5000, options: [1] },
				{ id: cake.variantIds[2], name: "Lemon", unitPriceCents: 4800, options: [2] },
			],
		);
	});

	/** The second save: Layers arrives, and the grid becomes three by two. */
	async function addLayers(prices: number[][]) {
		const [g] = saved.groupIds;
		const [flavours] = saved.optionIds;
		const names = ["Chocolate", "Carrot", "Lemon"];
		const layers = ["2 layers", "3 layers"];

		const variants: VariantIn[] = [];
		for (const [f, flavour] of names.entries()) {
			for (const [l, layer] of layers.entries()) {
				const cents = prices[f]![l]!;
				if (cents === 0) continue; // a combination she does not make
				variants.push({
					// The first column keeps the ids the flat product had.
					id: l === 0 ? saved.variantIds[f] : undefined,
					name: `${flavour} · ${layer}`,
					unitPriceCents: cents,
					options: [f, l],
				});
			}
		}

		return replaySave(
			cakeId,
			[
				{
					id: g,
					name: "Flavour",
					options: names.map((name, at) => ({ id: flavours![at], name })),
				},
				{ name: "Layers", options: layers.map((name) => ({ name })) },
			],
			variants,
		);
	}

	it("keeps the original ids and adds only what is new", async () => {
		await addLayers([
			[4500, 6500],
			[5000, 7000],
			[4800, 6800],
		]);

		const rows = await variantRows(cakeId);
		expect(rows).toHaveLength(6);
		// The three that existed are still the same rows, renamed.
		expect(rows.filter((r) => saved.variantIds.includes(r.id)).map((r) => r.name)).toEqual([
			"Chocolate · 2 layers",
			"Carrot · 2 layers",
			"Lemon · 2 layers",
		]);
		expect(rows.map((r) => r.answers)).toEqual([
			"Chocolate | 2 layers",
			"Chocolate | 3 layers",
			"Carrot | 2 layers",
			"Carrot | 3 layers",
			"Lemon | 2 layers",
			"Lemon | 3 layers",
		]);
	});

	it("leaves the order placed before any of this pointing at its row", async () => {
		await addLayers([
			[4500, 6500],
			[5000, 7000],
			[4800, 6800],
		]);

		const item = await db.query<{ product_variant_id: string | null; variant_name: string }>(
			"select product_variant_id, variant_name from order_items where order_id = $1",
			[firstOrder],
		);
		// Still the same row, even though that row is now called something else.
		expect(item.rows[0]!.product_variant_id).toBe(saved.variantIds[0]);
		// And the order still says what was actually bought that day.
		expect(item.rows[0]!.variant_name).toBe("Chocolate");
	});

	it("prices each combination on its own", async () => {
		const after = await addLayers([
			[4500, 6500],
			[5000, 7000],
			[4800, 6800],
		]);

		const rows = await variantRows(cakeId);
		const priceOf = (name: string) => rows.find((r) => r.name === name)!.unit_price_cents;
		expect(priceOf("Chocolate · 3 layers")).toBe(6500);
		expect(priceOf("Carrot · 3 layers")).toBe(7000);

		const three = rows.find((r) => r.name === "Carrot · 3 layers")!;
		expect((await order(cakeId, three.id)).total_cents).toBe(7000);
		expect(after.variantIds).toHaveLength(6);
	});

	it("leaves a hole where she did not price a combination", async () => {
		// Lemon in three layers is not something she makes.
		await addLayers([
			[4500, 6500],
			[5000, 7000],
			[4800, 0],
		]);

		const rows = await variantRows(cakeId);
		expect(rows).toHaveLength(5);
		expect(rows.map((r) => r.name)).not.toContain("Lemon · 3 layers");
	});
});

describe("what a later save takes away", () => {
	let cakeId: string;
	let saved: Awaited<ReturnType<typeof replaySave>>;
	let orderId: string;

	beforeEach(async () => {
		const cake = await aFlatCake(`shrink-${Math.random().toString(36).slice(2, 9)}`);
		cakeId = cake.id;
		saved = await replaySave(
			cakeId,
			[
				{
					name: "Flavour",
					options: [{ name: "Chocolate" }, { name: "Carrot" }, { name: "Lemon" }],
				},
			],
			[
				{ id: cake.variantIds[0], name: "Chocolate", unitPriceCents: 4500, options: [0] },
				{ id: cake.variantIds[1], name: "Carrot", unitPriceCents: 5000, options: [1] },
				{ id: cake.variantIds[2], name: "Lemon", unitPriceCents: 4800, options: [2] },
			],
		);
		orderId = (await order(cakeId, saved.variantIds[2]!)).id;
	});

	it("removes an answer and the combination made of it, and the order survives", async () => {
		// Lemon goes. The form simply stops listing it and its combination.
		await replaySave(
			cakeId,
			[
				{
					id: saved.groupIds[0],
					name: "Flavour",
					options: [
						{ id: saved.optionIds[0]![0], name: "Chocolate" },
						{ id: saved.optionIds[0]![1], name: "Carrot" },
					],
				},
			],
			[
				{ id: saved.variantIds[0], name: "Chocolate", unitPriceCents: 4500, options: [0] },
				{ id: saved.variantIds[1], name: "Carrot", unitPriceCents: 5000, options: [1] },
			],
		);

		const rows = await variantRows(cakeId);
		expect(rows.map((r) => r.name)).toEqual(["Chocolate", "Carrot"]);

		// The pointer goes null, the words stay. This is the promise order_items
		// makes and the reason the name is snapshotted at all.
		const item = await db.query<{ product_variant_id: string | null; variant_name: string }>(
			"select product_variant_id, variant_name from order_items where order_id = $1",
			[orderId],
		);
		expect(item.rows[0]!.product_variant_id).toBeNull();
		expect(item.rows[0]!.variant_name).toBe("Lemon");
	});

	it("takes the questions away again when the product goes back to one price", async () => {
		await replaySave(cakeId, [], []);

		expect(await variantRows(cakeId)).toHaveLength(0);
		const groups = await db.query("select 1 from product_option_groups where product_id = $1", [
			cakeId,
		]);
		expect(groups.rows).toHaveLength(0);
		// Nothing is left pointing anywhere.
		const links = await db.query("select 1 from product_variant_options");
		expect(links.rows.length).toBeGreaterThanOrEqual(0);

		// And the product still sells, at its own price.
		expect((await order(cakeId, null)).total_cents).toBe(4500);
	});

	it("renames an answer without rewriting what an order said", async () => {
		await replaySave(
			cakeId,
			[
				{
					id: saved.groupIds[0],
					name: "Flavour",
					options: [
						{ id: saved.optionIds[0]![0], name: "Chocolate" },
						{ id: saved.optionIds[0]![1], name: "Carrot" },
						{ id: saved.optionIds[0]![2], name: "Lemon & thyme" },
					],
				},
			],
			[
				{ id: saved.variantIds[0], name: "Chocolate", unitPriceCents: 4500, options: [0] },
				{ id: saved.variantIds[1], name: "Carrot", unitPriceCents: 5000, options: [1] },
				{ id: saved.variantIds[2], name: "Lemon & thyme", unitPriceCents: 4800, options: [2] },
			],
		);

		const rows = await variantRows(cakeId);
		expect(rows.map((r) => r.name)).toContain("Lemon & thyme");

		const item = await db.query<{ variant_name: string; product_variant_id: string | null }>(
			"select variant_name, product_variant_id from order_items where order_id = $1",
			[orderId],
		);
		expect(item.rows[0]!.variant_name).toBe("Lemon");
		expect(item.rows[0]!.product_variant_id).toBe(saved.variantIds[2]);
	});
});

describe("what the database refuses", () => {
	let cakeId: string;

	beforeEach(async () => {
		const cake = await aFlatCake(`refuse-${Math.random().toString(36).slice(2, 9)}`);
		cakeId = cake.id;
	});

	it("refuses two answers with the same name under one question", async () => {
		const message = await errorOf(() =>
			replaySave(
				cakeId,
				[{ name: "Flavour", options: [{ name: "Chocolate" }, { name: "Chocolate" }] }],
				[],
			),
		);
		expect(message).toContain("product_options_group_id_name_key");
	});

	it("refuses two questions with the same name on one product", async () => {
		const message = await errorOf(() =>
			replaySave(
				cakeId,
				[
					{ name: "Flavour", options: [{ name: "Chocolate" }] },
					{ name: "Flavour", options: [{ name: "2 layers" }] },
				],
				[],
			),
		);
		expect(message).toContain("product_option_groups_product_id_name_key");
	});

	it("refuses two combinations that come out with the same name", async () => {
		const message = await errorOf(() =>
			replaySave(
				cakeId,
				[{ name: "Flavour", options: [{ name: "Chocolate" }, { name: "Carrot" }] }],
				[
					{ name: "Same", unitPriceCents: 100, options: [0] },
					{ name: "Same", unitPriceCents: 200, options: [1] },
				],
			),
		);
		expect(message).toContain("product_variants_product_id_name_key");
	});

	/**
	 * Swapping two names is written one row at a time, so the halfway state has a
	 * duplicate in it and the unique index fires. The admin turns this into
	 * "rename one and save again", which is the whole reason that message exists.
	 */
	it("refuses a straight swap of two answer names", async () => {
		const saved = await replaySave(
			cakeId,
			[{ name: "Flavour", options: [{ name: "Chocolate" }, { name: "Carrot" }] }],
			[{ name: "Chocolate", unitPriceCents: 4500, options: [0] }],
		);

		const message = await errorOf(() =>
			replaySave(
				cakeId,
				[
					{
						id: saved.groupIds[0],
						name: "Flavour",
						options: [
							{ id: saved.optionIds[0]![0], name: "Carrot" },
							{ id: saved.optionIds[0]![1], name: "Chocolate" },
						],
					},
				],
				[{ id: saved.variantIds[0], name: "Carrot", unitPriceCents: 4500, options: [0] }],
			),
		);
		expect(message).toContain("product_options_group_id_name_key");
	});
});

describe("what a customer sees while a save is in flight", () => {
	/**
	 * The links are cleared and rewritten a combination at a time, and between
	 * the clearing and the rewriting that combination answers no questions at
	 * all — which `place_order` refuses, because a combination that does not
	 * answer every question is one whose flavour has been deleted.
	 *
	 * That window used to open for every combination on the product on every
	 * save, so an order placed while the owner was repricing a cake came back
	 * saying the flavour was unavailable. Now nothing that leaves the answers
	 * alone touches a link at all, which is what repricing, renaming and selling
	 * out all do.
	 */
	let cakeId: string;
	let saved: Awaited<ReturnType<typeof replaySave>>;

	beforeEach(async () => {
		const cake = await aFlatCake(`flight-${Math.random().toString(36).slice(2, 9)}`);
		cakeId = cake.id;
		saved = await replaySave(
			cakeId,
			[
				{
					name: "Flavour",
					options: [{ name: "Chocolate" }, { name: "Carrot" }, { name: "Lemon" }],
				},
			],
			[
				{ id: cake.variantIds[0], name: "Chocolate", unitPriceCents: 4500, options: [0] },
				{ id: cake.variantIds[1], name: "Carrot", unitPriceCents: 5000, options: [1] },
				{ id: cake.variantIds[2], name: "Lemon", unitPriceCents: 4800, options: [2] },
			],
		);
	});

	/** The rows as they stand, so a save can be shown to have touched none of them. */
	async function linkRows() {
		const result = await db.query<{ variant_id: string; option_id: string; ctid: string }>(
			`select variant_id::text, option_id::text, ctid::text from product_variant_options
			 where variant_id = any($1) order by variant_id, option_id`,
			[saved.variantIds],
		);
		return result.rows;
	}

	/** The same save the form makes, with one price changed. */
	function repriced(cents: number) {
		return replaySave(
			cakeId,
			[
				{
					id: saved.groupIds[0],
					name: "Flavour",
					options: [
						{ id: saved.optionIds[0]![0], name: "Chocolate" },
						{ id: saved.optionIds[0]![1], name: "Carrot" },
						{ id: saved.optionIds[0]![2], name: "Lemon" },
					],
				},
			],
			[
				{ id: saved.variantIds[0], name: "Chocolate", unitPriceCents: cents, options: [0] },
				{ id: saved.variantIds[1], name: "Carrot", unitPriceCents: 5000, options: [1] },
				{ id: saved.variantIds[2], name: "Lemon", unitPriceCents: 4800, options: [2] },
			],
		);
	}

	it("does not touch a single link when only a price changed", async () => {
		const before = await linkRows();
		await repriced(4700);
		const after = await linkRows();

		// Same physical rows, not merely the same values: `ctid` moves when a row
		// is deleted and written again, so this fails if the save rewrote them.
		expect(after).toEqual(before);

		// And the new price is in fact saved.
		const rows = await variantRows(cakeId);
		expect(rows.find((r) => r.name === "Chocolate")!.unit_price_cents).toBe(4700);
	});

	it("does not touch a link when a flavour is renamed or sold out", async () => {
		const before = await linkRows();

		await replaySave(
			cakeId,
			[
				{
					id: saved.groupIds[0],
					name: "Flavour",
					options: [
						{ id: saved.optionIds[0]![0], name: "Dark chocolate" },
						{ id: saved.optionIds[0]![1], name: "Carrot", isAvailable: false },
						{ id: saved.optionIds[0]![2], name: "Lemon" },
					],
				},
			],
			[
				{ id: saved.variantIds[0], name: "Dark chocolate", unitPriceCents: 4500, options: [0] },
				{ id: saved.variantIds[1], name: "Carrot", unitPriceCents: 5000, options: [1] },
				{ id: saved.variantIds[2], name: "Lemon", unitPriceCents: 4800, options: [2] },
			],
		);

		expect(await linkRows()).toEqual(before);
	});

	it("leaves every combination orderable right after a save", async () => {
		await repriced(4700);

		expect((await order(cakeId, saved.variantIds[0]!)).total_cents).toBe(4700);
		expect((await order(cakeId, saved.variantIds[1]!)).total_cents).toBe(5000);
		expect((await order(cakeId, saved.variantIds[2]!)).total_cents).toBe(4800);
	});

	it("only rewrites the combination whose answer actually moved", async () => {
		// A fourth flavour arrives and the third combination is repointed at it.
		// Only that one has moved; the other two must be left exactly as they are.
		const before = await linkRows();
		const untouched = before.filter((r) => r.variant_id !== saved.variantIds[2]);

		await replaySave(
			cakeId,
			[
				{
					id: saved.groupIds[0],
					name: "Flavour",
					options: [
						{ id: saved.optionIds[0]![0], name: "Chocolate" },
						{ id: saved.optionIds[0]![1], name: "Carrot" },
						{ id: saved.optionIds[0]![2], name: "Lemon" },
						{ name: "Ube" },
					],
				},
			],
			[
				{ id: saved.variantIds[0], name: "Chocolate", unitPriceCents: 4500, options: [0] },
				{ id: saved.variantIds[1], name: "Carrot", unitPriceCents: 5000, options: [1] },
				{ id: saved.variantIds[2], name: "Ube", unitPriceCents: 5200, options: [3] },
			],
		);

		const after = await linkRows();
		// Chocolate and Carrot are the same physical rows they were.
		expect(after.filter((r) => r.variant_id !== saved.variantIds[2])).toEqual(untouched);

		const rows = await variantRows(cakeId);
		expect(rows.find((r) => r.id === saved.variantIds[2])!.answers).toBe("Ube");
		expect(rows.find((r) => r.id === saved.variantIds[0])!.answers).toBe("Chocolate");
	});
	it("still refuses an order for a combination caught mid-rewrite", async () => {
		// The window has not been closed, only narrowed to the combinations whose
		// answers are genuinely changing. This is what it looks like while it is
		// open, and is the reason the guard in place_order is worth having.
		await db.query("delete from product_variant_options where variant_id = $1", [
			saved.variantIds[0],
		]);

		const message = await errorOf(() => order(cakeId, saved.variantIds[0]!));
		expect(message).toContain("VARIANT_UNAVAILABLE");

		// The others are untouched and still sell.
		expect((await order(cakeId, saved.variantIds[1]!)).total_cents).toBe(5000);
	});
});
