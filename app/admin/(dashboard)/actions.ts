"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "@/lib/action-state";
import { actionError, actionOk } from "@/lib/types";
import {
	blockRangeSchema,
	categorySchema,
	checkbox,
	fieldErrorsOf,
	overrideSchema,
	productSchema,
	settingsSchema,
} from "@/lib/validation";
import { eachDay } from "@/lib/dates";
import { getProductSlugs } from "@/lib/queries";
import { syncRows } from "@/lib/sync-rows";
import { refusedRemoval } from "@/lib/variant-guard";

/**
 * Every admin mutation.
 *
 * All of them start with `requireAdmin()` and then write through the request's
 * own session, so row level security is a second, independent check: a caller
 * who somehow reached one of these without being the owner writes nothing.
 *
 * Public pages are cached, so anything that changes what a visitor sees ends
 * with `revalidateCatalogue()`.
 */

/**
 * WHY NONE OF THESE PASS "page": it does not work here, and used to be silently
 * doing nothing at all.
 *
 * `revalidatePath(path, "page")` purges by cache tag, and the tag it builds is
 * `path + "/page"`. The tag a rendered page actually carries is built from the
 * route as the app directory keys it — which includes the route group. Every
 * public page of this site lives in `(site)` or `(menu)`, so the tags on the
 * shop page read `/(site)/shop/page` while `revalidatePath("/shop", "page")`
 * asked for `/shop/page`, and nothing matched. Every call in here was a no-op
 * from the day it was written; the pages were only ever coming back on the
 * hour-long `revalidate` timer, which is short enough that it looked like it
 * worked. See the keys in `.next/app-path-routes-manifest.json`, which are the
 * tag source: `"/(site)/shop/[slug]/page": "/shop/[slug]"`.
 *
 * Without a type, the path is matched against the URL the visitor asked for,
 * which has no route group in it and cannot go stale against one. So every
 * fixed page below is named by its own URL, and the product pages are named one
 * slug at a time.
 *
 * Verified against a production build on 2026-09-17: "page" purged none of `/`,
 * `/shop`, `/shop/[slug]` or `/terms`, and the plain form purged all four.
 */
async function revalidateCatalogue(): Promise<void> {
	revalidatePath("/");
	revalidatePath("/shop");
	revalidatePath("/order");
	// The privacy page prints the business name and the contact address, so a
	// settings save has to reach it too.
	revalidatePath("/privacy");
	// And the terms quote the delivery fee and the collection wording, which are
	// the same settings. This page was missing from the list entirely.
	revalidatePath("/terms");
	// The market card is unlisted and its prices are hard-coded, but it quotes the
	// bank account, and the day that changes is the day it must not still be
	// showing the old one.
	revalidatePath("/menu");
	revalidatePath("/sitemap.xml");

	// The product pages, one URL at a time, because a pattern cannot be matched
	// without the route group and a group is a thing someone renames.
	//
	// A slug that has just been deleted or renamed is not in this list any more,
	// so the line below covers those: the grouped pattern purges every product
	// page at once, old URL included. It is the undocumented half of this, which
	// is why it is the backstop rather than the mechanism — if the `(site)` group
	// is ever renamed this stops matching and every product that still exists is
	// still purged by the loop.
	for (const slug of await getProductSlugs()) {
		revalidatePath(`/shop/${slug}`);
	}
	revalidatePath("/(site)/shop/[slug]", "page");
}

type State = FormState;

function fail(error: string, fieldErrors?: Record<string, string>): State {
	return { result: actionError(error, fieldErrors) };
}

function ok(): State {
	return { result: actionOk() };
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function saveProduct(_previous: State, formData: FormData): Promise<State> {
	await requireAdmin();

	let tiers: unknown = [];
	try {
		tiers = JSON.parse(String(formData.get("tiers") ?? "[]"));
	} catch {
		return fail("The bundle prices couldn't be read. Please try again.");
	}

	let priceGuide: unknown = [];
	try {
		priceGuide = JSON.parse(String(formData.get("priceGuide") ?? "[]"));
	} catch {
		return fail("The price guide couldn't be read. Please try again.");
	}

	let variants: unknown = [];
	let optionGroups: unknown = [];
	let removedVariants: unknown = [];
	try {
		variants = JSON.parse(String(formData.get("variants") ?? "[]"));
		optionGroups = JSON.parse(String(formData.get("optionGroups") ?? "[]"));
		removedVariants = JSON.parse(String(formData.get("removedVariants") ?? "[]"));
	} catch {
		return fail("The variants couldn't be read. Please try again.");
	}

	let extras: unknown = [];
	try {
		extras = JSON.parse(String(formData.get("extras") ?? "[]"));
	} catch {
		return fail("The extras couldn't be read. Please try again.");
	}

	const parsed = productSchema.safeParse({
		id: formData.get("id") || undefined,
		name: formData.get("name") ?? "",
		slug: formData.get("slug") ?? "",
		categoryId: formData.get("categoryId") ?? "",
		description: formData.get("description") ?? "",
		unitPriceCents: formData.get("unitPrice") ?? "",
		unitLabel: formData.get("unitLabel") ?? "each",
		qtyStep: formData.get("qtyStep") ?? 1,
		minPerOrder: formData.get("minPerOrder") ?? "",
		imagePath: formData.get("imagePath") ?? "",
		imageAlt: formData.get("imageAlt") ?? "",
		isAvailable: checkbox(formData, "isAvailable"),
		isFeatured: checkbox(formData, "isFeatured"),
		priceOnRequest: checkbox(formData, "priceOnRequest"),
		wantsBrief: checkbox(formData, "wantsBrief"),
		wantsCustomFlavour: checkbox(formData, "wantsCustomFlavour"),
		// The marker is what tells an unticked box apart from a form rendered
		// before this field existed. The question is on by default, so an absent
		// checkbox would otherwise read as "off" and saving a product from a stale
		// tab would quietly take its note box away. Same trick as removeVariants,
		// for the same reason.
		wantsNote: checkbox(formData, "wantsNoteAsked") ? checkbox(formData, "wantsNote") : true,
		noteHint: formData.get("noteHint") ?? "",
		notePlaceholder: formData.get("notePlaceholder") ?? "",
		availabilityNote: formData.get("availabilityNote") ?? "",
		allergens: formData.getAll("allergens").map(String),
		sortOrder: formData.get("sortOrder") ?? 0,
		tiers,
		priceGuide,
		priceGuideNote: formData.get("priceGuideNote") ?? "",
		variantLabel: formData.get("variantLabel") ?? "Flavour",
		optionGroups,
		variants,
		extras,
		removeVariants: checkbox(formData, "removeVariants"),
		removedVariants,
	});

	if (!parsed.success) {
		const fieldErrors = fieldErrorsOf(parsed.error);
		return fail("Please check the highlighted fields.", fieldErrors);
	}

	const input = parsed.data;
	const supabase = await createClient();

	const row = {
		name: input.name,
		slug: input.slug,
		category_id: input.categoryId,
		description: input.description,
		unit_price_cents: input.unitPriceCents,
		unit_label: input.unitLabel,
		qty_step: input.qtyStep,
		min_per_order: input.minPerOrder,
		image_path: input.imagePath,
		image_alt: input.imageAlt,
		is_available: input.isAvailable,
		is_featured: input.isFeatured,
		availability_note: input.availabilityNote,
		allergens: input.allergens,
		sort_order: input.sortOrder,
		variant_label: input.variantLabel,
		price_on_request: input.priceOnRequest,
		price_guide_note: input.priceGuideNote,
		wants_brief: input.wantsBrief,
		wants_custom_flavour: input.wantsCustomFlavour,
		wants_note: input.wantsNote,
		note_hint: input.noteHint,
		note_placeholder: input.notePlaceholder,
	};

	let productId = input.id;

	if (productId) {
		const { error } = await supabase.from("products").update(row).eq("id", productId);
		if (error) return fail(describe(error.message, "product"));
	} else {
		const { data, error } = await supabase.from("products").insert(row).select("id").single();
		if (error) return fail(describe(error.message, "product"));
		productId = data.id;
	}

	// Tiers are replaced wholesale rather than diffed. There are at most a
	// handful and they have no identity of their own.
	await supabase.from("product_price_tiers").delete().eq("product_id", productId!);
	if (input.tiers.length > 0) {
		const { error } = await supabase.from("product_price_tiers").insert(
			input.tiers.map((tier) => ({
				product_id: productId!,
				qty: tier.qty,
				price_cents: tier.priceCents,
			})),
		);
		if (error) return fail("The product saved, but its bundle prices didn't. Please try again.");
	}

	// Replaced wholesale, like the tiers above and for the same reason: a line of
	// the guide has no identity worth keeping. Nothing points at one, no order
	// was ever priced from one, and the list is short enough to rewrite.
	await supabase.from("product_price_guide").delete().eq("product_id", productId!);
	if (input.priceGuide.length > 0) {
		const { error } = await supabase.from("product_price_guide").insert(
			input.priceGuide.map((row, index) => ({
				product_id: productId!,
				label: row.label,
				price_cents: row.priceCents,
				is_addition: row.isAddition,
				sort_order: index + 1,
			})),
		);
		if (error) return fail("The product saved, but its price guide didn't. Please try again.");
	}

	const variantError = await saveVariants(
		supabase,
		productId!,
		input.optionGroups,
		input.variants,
		input.removeVariants,
		input.removedVariants,
	);
	if (variantError) return fail(variantError);

	const extraError = await saveExtras(supabase, productId!, input.extras);
	if (extraError) return fail(extraError);

	await revalidateCatalogue();
	revalidatePath("/admin/products");
	return ok();
}

/**
 * Brings this product's extras into line with what the form submitted.
 *
 * Not replaced wholesale the way its bundle prices are, because an extra has an
 * identity that outlives the form: `order_item_extras` points at the row it was
 * ordered from, so deleting and re-inserting would hand every extra a new id on
 * every save and quietly cut every past order loose from what it named. Rows
 * the form still names are updated in place, rows it dropped are deleted, and
 * only genuinely new ones are inserted.
 *
 * The delete comes first so a name freed by a removed row is available to a row
 * taking it. A basket filled before that delete is refused by `place_order`
 * rather than baked without its candles.
 */
async function saveExtras(
	supabase: Awaited<ReturnType<typeof createClient>>,
	productId: string,
	extras: Array<{
		id?: string;
		name: string;
		description: string | null;
		priceCents: number;
		maxQty: number;
		isAvailable: boolean;
	}>,
): Promise<string | null> {
	const failed = "The product saved, but its extras didn't. Please try again.";
	const clash = "Two of those extras have the same name. Rename one and save again.";

	// Nothing points at an extra's id after the save, so the inserts are not
	// read back. See `trackIds`.
	const result = await syncRows({
		supabase,
		table: "product_extras",
		parentColumn: "product_id",
		parentId: productId,
		rows: extras.map((extra, index) => ({
			id: extra.id,
			product_id: productId,
			name: extra.name,
			description: extra.description,
			price_cents: extra.priceCents,
			max_qty: extra.maxQty,
			is_available: extra.isAvailable,
			sort_order: index + 1,
		})),
		describeError: (message) =>
			message.includes("product_extras_product_id_name_key") ? clash : failed,
	});

	return result.ok ? null : result.error;
}

type OptionInput = {
	id?: string;
	name: string;
	imagePath: string | null;
	allergens: string[];
	isAvailable: boolean;
};

type OptionGroupInput = { id?: string; name: string; options: OptionInput[] };

type VariantInput = {
	id?: string;
	name: string;
	unitPriceCents: number;
	imagePath: string | null;
	allergens: string[];
	isAvailable: boolean;
	/** One index per group, into that group's options. */
	options: number[];
};

const VARIANTS_FAILED = "The product saved, but its variants didn't. Please try again.";

/** A clash on one of the unique-name indexes, said in words she can act on. */
function nameClash(message: string): string | null {
	if (message.includes("product_variants_product_id_name_key")) {
		return "Two of those combinations came out with the same name. Rename one and save again.";
	}
	if (message.includes("product_option_groups_product_id_name_key")) {
		return "Two of those variants have the same name. Rename one and save again.";
	}
	if (message.includes("product_options_group_id_name_key")) {
		return "Two options in one variant have the same name. Rename one and save again.";
	}
	return null;
}

/**
 * Brings the product's option groups, options and priced combinations into line
 * with what the form submitted.
 *
 * None of it is replaced wholesale the way bundle prices are, because all three
 * have an identity that outlives the form. A variant's is the one that matters
 * most — `order_items` points at the row it was ordered from, so deleting and
 * re-inserting would hand every combination a new id on every save and quietly
 * cut every past order loose from what it named. Groups and options are kept by
 * id for a smaller reason: a variant's link row names them, and churning them
 * would rebuild every link on every save for nothing.
 *
 * So rows the form still names are updated in place, rows it dropped are
 * deleted, and only genuinely new ones are inserted. Deletes cascade the way
 * the schema says: dropping a group takes its options and every link to them
 * with it, and dropping a combination takes its links.
 *
 * Returns a message on failure, or null when it worked.
 */
async function saveVariants(
	supabase: Awaited<ReturnType<typeof createClient>>,
	productId: string,
	groups: OptionGroupInput[],
	variants: VariantInput[],
	removeVariants: boolean,
	removedVariants: string[],
): Promise<string | null> {
	// --- nothing is wiped by accident ----------------------------------------
	// Which rows this save is allowed to take off the product, and what to say
	// when it is not. Lives in lib/ so that it can be tested against the case it
	// exists for; see lib/variant-guard.test.ts.
	const { data: held, error: heldError } = await supabase
		.from("product_variants")
		.select("id, name")
		.eq("product_id", productId);
	if (heldError) return VARIANTS_FAILED;

	const refused = refusedRemoval({
		held: held ?? [],
		submittedIds: ids(variants),
		submittedCount: variants.length,
		removeVariants,
		removedVariants,
	});
	if (refused) return refused;

	// --- the option groups ---------------------------------------------------
	// Deletes come first at every level, so a name freed by a removed row is
	// available to a row that is taking it. PostgREST has no way to spell "not in
	// the empty set", so clearing the lot and filtering down to the survivors
	// have to be separate calls.
	const savedGroups = await syncRows({
		supabase,
		table: "product_option_groups",
		parentColumn: "product_id",
		parentId: productId,
		rows: groups.map((group, index) => ({
			id: group.id,
			product_id: productId,
			name: group.name,
			sort_order: index,
		})),
		// The options below are filed under these ids, so they have to come back.
		trackIds: true,
		describeError: (message) => nameClash(message) ?? VARIANTS_FAILED,
	});
	if (!savedGroups.ok) return savedGroups.error;
	const groupIds = savedGroups.ids;

	// --- their options -------------------------------------------------------
	const optionIds: string[][] = [];

	for (const [index, group] of groups.entries()) {
		const groupId = groupIds[index]!;

		const saved = await syncRows({
			supabase,
			table: "product_options",
			// The only one of the four filed under a group rather than a product.
			parentColumn: "group_id",
			parentId: groupId,
			rows: group.options.map((option, at) => ({
				id: option.id,
				group_id: groupId,
				name: option.name,
				image_path: option.imagePath,
				allergens: option.allergens,
				is_available: option.isAvailable,
				sort_order: at,
			})),
			// The link rows below name these, so they have to come back.
			trackIds: true,
			describeError: (message) => nameClash(message) ?? VARIANTS_FAILED,
		});
		if (!saved.ok) return saved.error;
		optionIds.push(saved.ids);
	}

	// --- the combinations ----------------------------------------------------
	const savedVariants = await syncRows({
		supabase,
		table: "product_variants",
		parentColumn: "product_id",
		parentId: productId,
		rows: variants.map((variant, index) => ({
			id: variant.id,
			product_id: productId,
			name: variant.name,
			unit_price_cents: variant.unitPriceCents,
			image_path: variant.imagePath,
			allergens: variant.allergens,
			is_available: variant.isAvailable,
			sort_order: index,
		})),
		// `order_items` points at these, which is the id that matters most.
		trackIds: true,
		describeError: (message) => nameClash(message) ?? VARIANTS_FAILED,
	});
	if (!savedVariants.ok) return savedVariants.error;
	const variantIds = savedVariants.ids;

	// --- what each combination is made of ------------------------------------
	// Cleared and rewritten, but only for the combinations whose options have
	// actually moved.
	//
	// Clearing first is what lets two combinations swap options without a halfway
	// state that breaks the one-option-per-group key, so within a combination it
	// has to stay. Doing it to *every* combination is what had to go: between the
	// delete and the insert those rows draw on no group at all, and `place_order`
	// refuses a combination that does not take one option from every group — the
	// same guard that stops a deleted flavour being bought. A customer ordering
	// in that window was told the flavour was unavailable when nothing of the
	// sort was true.
	//
	// Repricing, renaming and selling out all leave the options alone, which is
	// nearly every save she will ever make, and those now touch no link at all.
	const wanted = variants.flatMap((variant, index) =>
		variant.options.map((chosen, group) => ({
			variant_id: variantIds[index]!,
			group_id: groupIds[group]!,
			option_id: optionIds[group]![chosen]!,
		})),
	);

	const key = (link: { variant_id: string; group_id: string }) =>
		`${link.variant_id}:${link.group_id}`;

	const current = new Map<string, string>();
	if (variantIds.length > 0) {
		const { data, error } = await supabase
			.from("product_variant_options")
			.select("variant_id, group_id, option_id")
			.in("variant_id", variantIds as string[]);
		if (error) return VARIANTS_FAILED;
		for (const row of data ?? []) current.set(key(row), row.option_id);
	}

	// A combination is stale if any option it should have differs from what it
	// has, or if it still holds an option from a group it no longer belongs to —
	// which is what a group being removed looks like from here.
	const stale = new Set<string>();
	for (const link of wanted) {
		if (current.get(key(link)) !== link.option_id) stale.add(link.variant_id);
	}
	const keep = new Set(wanted.map(key));
	for (const [held, _option] of current) {
		if (!keep.has(held)) stale.add(held.split(":")[0]!);
	}

	if (stale.size > 0) {
		const { error } = await supabase
			.from("product_variant_options")
			.delete()
			.in("variant_id", [...stale]);
		if (error) return VARIANTS_FAILED;

		const rewritten = wanted.filter((link) => stale.has(link.variant_id));
		if (rewritten.length > 0) {
			const { error: insertError } = await supabase
				.from("product_variant_options")
				.insert(rewritten);
			if (insertError) return VARIANTS_FAILED;
		}
	}

	return null;
}

/** The database ids among a list of form rows, skipping the ones not saved yet. */
function ids(rows: Array<{ id?: string }>): string[] {
	return rows.map((row) => row.id).filter((id): id is string => Boolean(id));
}

export async function toggleProductFlag(
	id: string,
	field: "is_available" | "is_featured",
	value: boolean,
): Promise<void> {
	await requireAdmin();
	const supabase = await createClient();

	// Written out rather than computed so the column names stay type-checked.
	const patch = field === "is_available" ? { is_available: value } : { is_featured: value };
	await supabase.from("products").update(patch).eq("id", id);

	await revalidateCatalogue();
	revalidatePath("/admin/products");
}

/**
 * Moves a product one place up or down. Drag and drop would be nicer on a
 * desktop and worse on a phone, which is where this is actually used.
 */
export async function moveProduct(id: string, direction: "up" | "down"): Promise<void> {
	await requireAdmin();
	await move("products", "reorder_products", id, direction);
	await revalidateCatalogue();
	revalidatePath("/admin/products");
}

export async function deleteProduct(id: string): Promise<void> {
	await requireAdmin();
	const supabase = await createClient();
	// Order lines snapshot the product name and price, so past orders survive
	// this: the foreign key is `on delete set null`.
	await supabase.from("products").delete().eq("id", id);
	await revalidateCatalogue();
	revalidatePath("/admin/products");
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function saveCategory(_previous: State, formData: FormData): Promise<State> {
	await requireAdmin();

	const parsed = categorySchema.safeParse({
		id: formData.get("id") || undefined,
		name: formData.get("name") ?? "",
		slug: formData.get("slug") ?? "",
		accent: formData.get("accent") ?? "rose",
		sortOrder: formData.get("sortOrder") ?? 0,
	});

	if (!parsed.success) {
		return fail("Please check the highlighted fields.", fieldErrorsOf(parsed.error));
	}

	const input = parsed.data;
	const supabase = await createClient();
	const row = {
		name: input.name,
		slug: input.slug,
		accent: input.accent,
		sort_order: input.sortOrder,
	};

	const { error } = input.id
		? await supabase.from("categories").update(row).eq("id", input.id)
		: await supabase.from("categories").insert(row);

	if (error) return fail(describe(error.message, "category"));

	await revalidateCatalogue();
	revalidatePath("/admin/categories");
	return ok();
}

export async function deleteCategory(id: string): Promise<void> {
	await requireAdmin();
	const supabase = await createClient();

	// Deleting a category would silently orphan its products (the foreign key is
	// `on delete set null`), and orphaned products drop out of the shop's
	// category bands. Refuse instead and make the owner move them first.
	const { count } = await supabase
		.from("products")
		.select("id", { count: "exact", head: true })
		.eq("category_id", id);

	if ((count ?? 0) > 0) return;

	await supabase.from("categories").delete().eq("id", id);
	await revalidateCatalogue();
	revalidatePath("/admin/categories");
}

export async function moveCategory(id: string, direction: "up" | "down"): Promise<void> {
	await requireAdmin();
	await move("categories", "reorder_categories", id, direction);
	await revalidateCatalogue();
	revalidatePath("/admin/categories");
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export async function saveWeekdayDefaults(_previous: State, formData: FormData): Promise<State> {
	await requireAdmin();
	const supabase = await createClient();

	const updates = [];
	for (let weekday = 0; weekday < 7; weekday += 1) {
		const isOpen = checkbox(formData, `open-${weekday}`);
		const raw = Number(formData.get(`capacity-${weekday}`) ?? 0);
		const capacity = Number.isFinite(raw) ? Math.max(0, Math.min(999, Math.round(raw))) : 0;
		updates.push({ weekday, is_open: isOpen, capacity });
	}

	const { error } = await supabase
		.from("availability_rules")
		.upsert(updates, { onConflict: "weekday" });

	if (error) return fail("Those days couldn't be saved. Please try again.");

	await revalidateCatalogue();
	revalidatePath("/admin/availability");
	return ok();
}

export async function saveOverride(_previous: State, formData: FormData): Promise<State> {
	await requireAdmin();

	const parsed = overrideSchema.safeParse({
		date: formData.get("date") ?? "",
		isOpen: checkbox(formData, "isOpen"),
		capacity: formData.get("capacity") ?? "",
		note: formData.get("note") ?? "",
	});

	if (!parsed.success) {
		return fail("Please check the highlighted fields.", fieldErrorsOf(parsed.error));
	}

	const input = parsed.data;
	const supabase = await createClient();

	const { error } = await supabase.from("availability_overrides").upsert(
		{
			date: input.date,
			is_open: input.isOpen,
			capacity: input.capacity,
			note: input.note,
		},
		{ onConflict: "date" },
	);

	if (error) return fail("That day couldn't be saved. Please try again.");

	await revalidateCatalogue();
	revalidatePath("/admin/availability");
	return ok();
}

/** Removes an exception so the day goes back to its usual weekday pattern. */
export async function clearOverride(date: string): Promise<void> {
	await requireAdmin();
	const supabase = await createClient();
	await supabase.from("availability_overrides").delete().eq("date", date);
	await revalidateCatalogue();
	revalidatePath("/admin/availability");
}

export async function blockRange(_previous: State, formData: FormData): Promise<State> {
	await requireAdmin();

	const parsed = blockRangeSchema.safeParse({
		from: formData.get("from") ?? "",
		to: formData.get("to") ?? "",
		note: formData.get("note") ?? "",
	});

	if (!parsed.success) {
		return fail("Please check the dates.", fieldErrorsOf(parsed.error));
	}

	const { from, to, note } = parsed.data;
	const supabase = await createClient();

	const rows = eachDay(from, to).map((date) => ({
		date,
		is_open: false,
		capacity: null,
		note,
	}));

	const { error } = await supabase
		.from("availability_overrides")
		.upsert(rows, { onConflict: "date" });

	if (error) return fail("Those dates couldn't be blocked. Please try again.");

	await revalidateCatalogue();
	revalidatePath("/admin/availability");
	return ok();
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function saveSettings(_previous: State, formData: FormData): Promise<State> {
	await requireAdmin();

	// One hidden field holding the whole list, the same way the product form
	// submits its variants.
	let faqs: unknown = [];
	try {
		faqs = JSON.parse(String(formData.get("faqs") ?? "[]"));
	} catch {
		return fail("The questions couldn't be read. Please try again.");
	}

	let reviews: unknown = [];
	try {
		reviews = JSON.parse(String(formData.get("reviews") ?? "[]"));
	} catch {
		return fail("The reviews couldn't be read. Please try again.");
	}

	const parsed = settingsSchema.safeParse({
		businessName: formData.get("businessName") ?? "",
		tagline: formData.get("tagline") ?? "",
		aboutText: formData.get("aboutText") ?? "",
		pickupSuburb: formData.get("pickupSuburb") ?? "",
		pickupInstructions: formData.get("pickupInstructions") ?? "",
		pickupWindowText: formData.get("pickupWindowText") ?? "",
		leadTimeDays: formData.get("leadTimeDays") ?? 0,
		cutoffTime: formData.get("cutoffTime") ?? "20:00",
		bookingWindowDays: formData.get("bookingWindowDays") ?? 28,
		timezone: formData.get("timezone") ?? "Pacific/Auckland",
		ordersOpen: checkbox(formData, "ordersOpen"),
		ordersClosedMessage: formData.get("ordersClosedMessage") ?? "",
		deliveryEnabled: checkbox(formData, "deliveryEnabled"),
		deliveryFeeCents: formData.get("deliveryFee") || "0",
		deliveryAreaText: formData.get("deliveryAreaText") ?? "",
		contactEmail: formData.get("contactEmail") ?? "",
		contactPhone: formData.get("contactPhone") ?? "",
		instagramHandle: formData.get("instagramHandle") ?? "",
		bankAccountName: formData.get("bankAccountName") ?? "",
		bankAccountNumber: formData.get("bankAccountNumber") ?? "",
		pickupAddress: formData.get("pickupAddress") ?? "",
		notificationEmail: formData.get("notificationEmail") ?? "",
		faqs,
		reviews,
	});

	if (!parsed.success) {
		return fail("Please check the highlighted fields.", fieldErrorsOf(parsed.error));
	}

	const input = parsed.data;
	const supabase = await createClient();

	const [publicResult, privateResult] = await Promise.all([
		supabase
			.from("site_settings")
			.update({
				business_name: input.businessName,
				tagline: input.tagline,
				about_text: input.aboutText,
				pickup_suburb: input.pickupSuburb,
				pickup_instructions: input.pickupInstructions,
				pickup_window_text: input.pickupWindowText,
				lead_time_days: input.leadTimeDays,
				cutoff_time: input.cutoffTime,
				booking_window_days: input.bookingWindowDays,
				timezone: input.timezone,
				orders_open: input.ordersOpen,
				orders_closed_message: input.ordersClosedMessage,
				delivery_enabled: input.deliveryEnabled,
				delivery_fee_cents: input.deliveryFeeCents,
				delivery_area_text: input.deliveryAreaText,
				contact_email: input.contactEmail,
				contact_phone: input.contactPhone,
				instagram_handle: input.instagramHandle,
			})
			.eq("id", 1),
		supabase.from("site_settings_private").upsert(
			{
				id: 1,
				bank_account_name: input.bankAccountName,
				bank_account_number: input.bankAccountNumber,
				pickup_address: input.pickupAddress,
				notification_email: input.notificationEmail,
			},
			{ onConflict: "id" },
		),
	]);

	if (publicResult.error || privateResult.error) {
		return fail("Those settings couldn't be saved. Please try again.");
	}

	const faqError = await saveFaqs(supabase, input.faqs);
	if (faqError) return fail(faqError);

	const reviewError = await saveReviews(supabase, input.reviews);
	if (reviewError) return fail(reviewError);

	await revalidateCatalogue();
	revalidatePath("/admin/settings");
	return ok();
}

/**
 * Brings the home page's questions into line with what the form submitted.
 *
 * Replaced wholesale rather than diffed: nothing anywhere points at an faq, so a
 * row has no identity to preserve, and the order of the list is the order on the
 * page. Deleting first means a question the owner removed is gone even if the
 * list now ends up empty.
 */
async function saveFaqs(
	supabase: Awaited<ReturnType<typeof createClient>>,
	faqs: Array<{ question: string; answer: string }>,
): Promise<string | null> {
	// PostgREST refuses an unfiltered delete, so this says "every row" the long
	// way round.
	const { error: clearError } = await supabase.from("faqs").delete().not("id", "is", null);
	if (clearError) return "The settings saved, but the questions didn't. Please try again.";

	if (faqs.length === 0) return null;

	const { error } = await supabase.from("faqs").insert(
		faqs.map((faq, index) => ({
			question: faq.question,
			answer: faq.answer,
			sort_order: index + 1,
		})),
	);
	if (error) return "The settings saved, but the questions didn't. Please try again.";

	return null;
}

/**
 * The same arrangement for the reviews: replaced outright, ordered by position
 * in the list.
 */
async function saveReviews(
	supabase: Awaited<ReturnType<typeof createClient>>,
	reviews: Array<{ author: string; body: string; detail: string | null }>,
): Promise<string | null> {
	const { error: clearError } = await supabase.from("reviews").delete().not("id", "is", null);
	if (clearError) return "The settings saved, but the reviews didn't. Please try again.";

	if (reviews.length === 0) return null;

	const { error } = await supabase.from("reviews").insert(
		reviews.map((review, index) => ({
			author: review.author,
			body: review.body,
			detail: review.detail,
			sort_order: index + 1,
		})),
	);
	if (error) return "The settings saved, but the reviews didn't. Please try again.";

	return null;
}

/** The one-tap switch on the dashboard. */
export async function setOrdersOpen(open: boolean): Promise<void> {
	await requireAdmin();
	const supabase = await createClient();
	await supabase.from("site_settings").update({ orders_open: open }).eq("id", 1);
	await revalidateCatalogue();
	revalidatePath("/admin");
}

// ---------------------------------------------------------------------------

/**
 * Swaps a row with its neighbour and renumbers the list.
 *
 * Products and categories order themselves identically, so this is written once
 * and told which table it is working on. The renumber goes through an RPC
 * because it has to be one statement: sort orders can be duplicated or all zero
 * after a bulk import, so the whole list is renumbered rather than two values
 * swapped, and doing that as one UPDATE per row is both a round trip per row and
 * a chance to leave the list half-renumbered.
 */
async function move(
	table: "products" | "categories",
	rpc: "reorder_products" | "reorder_categories",
	id: string,
	direction: "up" | "down",
): Promise<void> {
	const supabase = await createClient();

	const { data: all } = await supabase
		.from(table)
		.select("id")
		.order("sort_order", { ascending: true });

	if (!all) return;

	const index = all.findIndex((row) => row.id === id);
	const targetIndex = direction === "up" ? index - 1 : index + 1;
	if (index === -1 || targetIndex < 0 || targetIndex >= all.length) return;

	const reordered = [...all];
	reordered[index] = all[targetIndex]!;
	reordered[targetIndex] = all[index]!;

	const { error } = await supabase.rpc(rpc, { p_ids: reordered.map((row) => row.id) });
	if (error) console.error(`[vvbakes] could not reorder ${table}`, error);
}

/** Turns a Postgres error into something the owner can act on. */
function describe(message: string, what: string): string {
	if (message.includes("duplicate key") && message.includes("slug")) {
		return `Another ${what} already uses that web address. Try a different one.`;
	}
	if (message.includes("violates check constraint")) {
		return "One of those values isn't allowed. Please check the form.";
	}
	console.error(`[vvbakes] could not save ${what}`, message);
	return `That ${what} couldn't be saved. Please try again.`;
}
