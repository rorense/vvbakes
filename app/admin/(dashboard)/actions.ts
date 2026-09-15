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

function revalidateCatalogue(): void {
	revalidatePath("/", "page");
	revalidatePath("/shop", "page");
	revalidatePath("/shop/[slug]", "page");
	revalidatePath("/order", "page");
	// The privacy page prints the business name and the contact address, so a
	// settings save has to reach it too.
	revalidatePath("/privacy", "page");
	// The market card is unlisted and its prices are hard-coded, but it quotes the
	// bank account, and the day that changes is the day it must not still be
	// showing the old one.
	revalidatePath("/menu", "page");
	revalidatePath("/sitemap.xml");
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

	let variants: unknown = [];
	let optionGroups: unknown = [];
	try {
		variants = JSON.parse(String(formData.get("variants") ?? "[]"));
		optionGroups = JSON.parse(String(formData.get("optionGroups") ?? "[]"));
	} catch {
		return fail("The variants couldn't be read. Please try again.");
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
		availabilityNote: formData.get("availabilityNote") ?? "",
		allergens: formData.getAll("allergens").map(String),
		sortOrder: formData.get("sortOrder") ?? 0,
		tiers,
		variantLabel: formData.get("variantLabel") ?? "Flavour",
		optionGroups,
		variants,
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

	const variantError = await saveVariants(supabase, productId!, input.optionGroups, input.variants);
	if (variantError) return fail(variantError);

	revalidateCatalogue();
	revalidatePath("/admin/products");
	return ok();
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
	/** One index per question, into that question's answers. */
	options: number[];
};

const VARIANTS_FAILED = "The product saved, but its variants didn't. Please try again.";

/** A clash on one of the unique-name indexes, said in words she can act on. */
function nameClash(message: string): string | null {
	if (message.includes("product_variants_product_id_name_key")) {
		return "Two of those combinations came out with the same name. Rename one and save again.";
	}
	if (message.includes("product_option_groups_product_id_name_key")) {
		return "Two of those questions have the same name. Rename one and save again.";
	}
	if (message.includes("product_options_group_id_name_key")) {
		return "Two answers to one question have the same name. Rename one and save again.";
	}
	return null;
}

/**
 * Brings the product's questions, answers and priced combinations into line
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
 * the schema says: dropping a question takes its answers and every link to them
 * with it, and dropping a combination takes its links.
 *
 * Returns a message on failure, or null when it worked.
 */
async function saveVariants(
	supabase: Awaited<ReturnType<typeof createClient>>,
	productId: string,
	groups: OptionGroupInput[],
	variants: VariantInput[],
): Promise<string | null> {
	// --- the questions -------------------------------------------------------
	// Deletes come first at every level, so a name freed by a removed row is
	// available to a row that is taking it. PostgREST has no way to spell "not in
	// the empty set", so clearing the lot and filtering down to the survivors
	// have to be separate calls.
	const keptGroups = ids(groups);
	const groupsGone = supabase.from("product_option_groups").delete().eq("product_id", productId);
	const { error: groupsDeleteError } =
		keptGroups.length > 0
			? await groupsGone.not("id", "in", `(${keptGroups.join(",")})`)
			: await groupsGone;
	if (groupsDeleteError) return VARIANTS_FAILED;

	const groupRows = groups.map((group, index) => ({
		id: group.id,
		product_id: productId,
		name: group.name,
		sort_order: index,
	}));

	const existingGroups = groupRows.filter((row) => row.id);
	if (existingGroups.length > 0) {
		const { error } = await supabase.from("product_option_groups").upsert(existingGroups);
		if (error) return nameClash(error.message) ?? VARIANTS_FAILED;
	}

	const mintedGroups = new Map<string, string>();
	const freshGroups = groupRows.filter((row) => !row.id).map(({ id: _id, ...row }) => row);
	if (freshGroups.length > 0) {
		const { data, error } = await supabase
			.from("product_option_groups")
			.insert(freshGroups)
			.select("id, name");
		if (error) return nameClash(error.message) ?? VARIANTS_FAILED;
		for (const row of data ?? []) mintedGroups.set(row.name, row.id);
	}

	const groupIds = groups.map((group) => group.id ?? mintedGroups.get(group.name));
	if (groupIds.some((id) => !id)) return VARIANTS_FAILED;

	// --- their answers -------------------------------------------------------
	const optionIds: string[][] = [];

	for (const [index, group] of groups.entries()) {
		const groupId = groupIds[index]!;

		const keptOptions = ids(group.options);
		const optionsGone = supabase.from("product_options").delete().eq("group_id", groupId);
		const { error: optionsDeleteError } =
			keptOptions.length > 0
				? await optionsGone.not("id", "in", `(${keptOptions.join(",")})`)
				: await optionsGone;
		if (optionsDeleteError) return VARIANTS_FAILED;

		const optionRows = group.options.map((option, at) => ({
			id: option.id,
			group_id: groupId,
			name: option.name,
			image_path: option.imagePath,
			allergens: option.allergens,
			is_available: option.isAvailable,
			sort_order: at,
		}));

		const existing = optionRows.filter((row) => row.id);
		if (existing.length > 0) {
			const { error } = await supabase.from("product_options").upsert(existing);
			if (error) return nameClash(error.message) ?? VARIANTS_FAILED;
		}

		const minted = new Map<string, string>();
		const fresh = optionRows.filter((row) => !row.id).map(({ id: _id, ...row }) => row);
		if (fresh.length > 0) {
			const { data, error } = await supabase
				.from("product_options")
				.insert(fresh)
				.select("id, name");
			if (error) return nameClash(error.message) ?? VARIANTS_FAILED;
			for (const row of data ?? []) minted.set(row.name, row.id);
		}

		const saved = group.options.map((option) => option.id ?? minted.get(option.name));
		if (saved.some((id) => !id)) return VARIANTS_FAILED;
		optionIds.push(saved as string[]);
	}

	// --- the combinations ----------------------------------------------------
	const keptVariants = ids(variants);
	const variantsGone = supabase.from("product_variants").delete().eq("product_id", productId);
	const { error: variantsDeleteError } =
		keptVariants.length > 0
			? await variantsGone.not("id", "in", `(${keptVariants.join(",")})`)
			: await variantsGone;
	if (variantsDeleteError) return VARIANTS_FAILED;

	const variantRows = variants.map((variant, index) => ({
		id: variant.id,
		product_id: productId,
		name: variant.name,
		unit_price_cents: variant.unitPriceCents,
		image_path: variant.imagePath,
		allergens: variant.allergens,
		is_available: variant.isAvailable,
		sort_order: index,
	}));

	const existingVariants = variantRows.filter((row) => row.id);
	if (existingVariants.length > 0) {
		const { error } = await supabase.from("product_variants").upsert(existingVariants);
		if (error) return nameClash(error.message) ?? VARIANTS_FAILED;
	}

	const mintedVariants = new Map<string, string>();
	const freshVariants = variantRows.filter((row) => !row.id).map(({ id: _id, ...row }) => row);
	if (freshVariants.length > 0) {
		const { data, error } = await supabase
			.from("product_variants")
			.insert(freshVariants)
			.select("id, name");
		if (error) return nameClash(error.message) ?? VARIANTS_FAILED;
		for (const row of data ?? []) mintedVariants.set(row.name, row.id);
	}

	const variantIds = variants.map((variant) => variant.id ?? mintedVariants.get(variant.name));
	if (variantIds.some((id) => !id)) return VARIANTS_FAILED;

	// --- what each combination is made of ------------------------------------
	// Rewritten rather than diffed. A link row is two foreign keys and no
	// identity of its own, so there is nothing in it worth preserving, and
	// clearing them all first is what lets two combinations swap answers without
	// a halfway state that breaks the one-answer-per-question key.
	if (variantIds.length > 0) {
		const { error } = await supabase
			.from("product_variant_options")
			.delete()
			.in("variant_id", variantIds as string[]);
		if (error) return VARIANTS_FAILED;
	}

	const links = variants.flatMap((variant, index) =>
		variant.options.map((chosen, group) => ({
			variant_id: variantIds[index]!,
			group_id: groupIds[group]!,
			option_id: optionIds[group]![chosen]!,
		})),
	);

	if (links.length > 0) {
		const { error } = await supabase.from("product_variant_options").insert(links);
		if (error) return VARIANTS_FAILED;
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

	revalidateCatalogue();
	revalidatePath("/admin/products");
}

/**
 * Moves a product one place up or down. Drag and drop would be nicer on a
 * desktop and worse on a phone, which is where this is actually used.
 */
export async function moveProduct(id: string, direction: "up" | "down"): Promise<void> {
	await requireAdmin();
	await move("products", "reorder_products", id, direction);
	revalidateCatalogue();
	revalidatePath("/admin/products");
}

export async function deleteProduct(id: string): Promise<void> {
	await requireAdmin();
	const supabase = await createClient();
	// Order lines snapshot the product name and price, so past orders survive
	// this: the foreign key is `on delete set null`.
	await supabase.from("products").delete().eq("id", id);
	revalidateCatalogue();
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

	revalidateCatalogue();
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
	revalidateCatalogue();
	revalidatePath("/admin/categories");
}

export async function moveCategory(id: string, direction: "up" | "down"): Promise<void> {
	await requireAdmin();
	await move("categories", "reorder_categories", id, direction);
	revalidateCatalogue();
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

	revalidateCatalogue();
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

	revalidateCatalogue();
	revalidatePath("/admin/availability");
	return ok();
}

/** Removes an exception so the day goes back to its usual weekday pattern. */
export async function clearOverride(date: string): Promise<void> {
	await requireAdmin();
	const supabase = await createClient();
	await supabase.from("availability_overrides").delete().eq("date", date);
	revalidateCatalogue();
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

	revalidateCatalogue();
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

	revalidateCatalogue();
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
	revalidateCatalogue();
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
