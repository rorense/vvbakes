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
	try {
		variants = JSON.parse(String(formData.get("variants") ?? "[]"));
	} catch {
		return fail("The flavours couldn't be read. Please try again.");
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
		maxPerOrder: formData.get("maxPerOrder") ?? "",
		imagePath: formData.get("imagePath") ?? "",
		imageAlt: formData.get("imageAlt") ?? "",
		isAvailable: checkbox(formData, "isAvailable"),
		isFeatured: checkbox(formData, "isFeatured"),
		availabilityNote: formData.get("availabilityNote") ?? "",
		allergens: formData.getAll("allergens").map(String),
		sortOrder: formData.get("sortOrder") ?? 0,
		tiers,
		variantLabel: formData.get("variantLabel") ?? "Flavour",
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
		max_per_order: input.maxPerOrder,
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

	const variantError = await saveVariants(supabase, productId!, input.variants, input.variantLabel);
	if (variantError) return fail(variantError);

	revalidateCatalogue();
	revalidatePath("/admin/products");
	return ok();
}

/**
 * Brings the product's variants into line with what the form submitted.
 *
 * Not replaced wholesale the way bundle prices are, because a variant has an
 * identity that outlives the form: `order_items` points at the row it was
 * ordered from. Deleting and re-inserting would give every flavour a new id on
 * every save and quietly null out that pointer on every past order. So rows the
 * form still names are updated in place, rows it dropped are deleted, and only
 * genuinely new flavours are inserted.
 *
 * Returns a message on failure, or null when it worked.
 */
async function saveVariants(
	supabase: Awaited<ReturnType<typeof createClient>>,
	productId: string,
	variants: Array<{ id?: string; name: string; unitPriceCents: number; isAvailable: boolean }>,
	variantLabel: string,
): Promise<string | null> {
	const keep = variants.map((variant) => variant.id).filter((id): id is string => Boolean(id));

	const remove = supabase.from("product_variants").delete().eq("product_id", productId);
	// `.not("id", "in", "()")` is not valid PostgREST, so the two cases differ.
	const { error: deleteError } =
		keep.length > 0 ? await remove.not("id", "in", `(${keep.join(",")})`) : await remove;

	if (deleteError) {
		return "The product saved, but its flavours didn't. Please try again.";
	}

	// The order the owner put them in is the order they appear in the picker.
	for (const [index, variant] of variants.entries()) {
		const row = {
			product_id: productId,
			name: variant.name,
			unit_price_cents: variant.unitPriceCents,
			is_available: variant.isAvailable,
			sort_order: index,
		};

		const { error } = variant.id
			? await supabase.from("product_variants").update(row).eq("id", variant.id)
			: await supabase.from("product_variants").insert(row);

		if (error) {
			// Also what a straight swap of two names looks like, since the rows are
			// written one at a time and the halfway state has a duplicate in it.
			return error.message.includes("product_variants_product_id_name_key")
				? `Two of those ${variantLabel.toLowerCase()}s clashed on a name. Rename one and save again.`
				: "The product saved, but its flavours didn't. Please try again.";
		}
	}

	return null;
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

	revalidateCatalogue();
	revalidatePath("/admin/settings");
	return ok();
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
