import "server-only";

import { countsFromRows } from "./availability";
import type { IsoDate } from "./dates";
import {
	toCategory,
	toOrder,
	toOrderEvent,
	toOverride,
	toPrivateSettings,
	toProduct,
	toRule,
	toSettings,
} from "./mappers";
import { createClient } from "./supabase/server";
import type {
	AvailabilityOverride,
	AvailabilityRule,
	Category,
	Order,
	OrderEvent,
	OrderStatus,
	OrderSummary,
	PrivateSettings,
	Product,
	SiteSettings,
} from "./types";

/**
 * Reads for the admin.
 *
 * These use the request's own session, so row level security is still doing the
 * work: if the signed-in user is not in `admins`, every one of these comes back
 * empty rather than leaking. Callers should still have run `requireAdmin()` so
 * the page redirects instead of rendering blank.
 */

const PRODUCT_SELECT = "*, product_price_tiers (qty, price_cents)";

export async function adminProducts(): Promise<Product[]> {
	const supabase = await createClient();
	const { data } = await supabase
		.from("products")
		.select(PRODUCT_SELECT)
		.order("sort_order", { ascending: true })
		.order("name", { ascending: true });
	return (data ?? []).map(toProduct);
}

export async function adminProduct(id: string): Promise<Product | null> {
	const supabase = await createClient();
	const { data } = await supabase
		.from("products")
		.select(PRODUCT_SELECT)
		.eq("id", id)
		.maybeSingle();
	return data ? toProduct(data) : null;
}

export async function adminCategories(): Promise<Category[]> {
	const supabase = await createClient();
	const { data } = await supabase
		.from("categories")
		.select("*")
		.order("sort_order", { ascending: true });
	return (data ?? []).map(toCategory);
}

/** How many products sit in each category, so deletes can be blocked. */
export async function categoryProductCounts(): Promise<Record<string, number>> {
	const supabase = await createClient();
	const { data } = await supabase.from("products").select("category_id");
	const counts: Record<string, number> = {};
	for (const row of data ?? []) {
		if (row.category_id) counts[row.category_id] = (counts[row.category_id] ?? 0) + 1;
	}
	return counts;
}

export async function adminSettings(): Promise<{
	settings: SiteSettings;
	privateSettings: PrivateSettings;
}> {
	const supabase = await createClient();
	const [publicRow, privateRow] = await Promise.all([
		supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
		supabase.from("site_settings_private").select("*").eq("id", 1).maybeSingle(),
	]);

	if (!publicRow.data) throw new Error("Site settings row is missing. Run supabase/seed.sql.");

	return {
		settings: toSettings(publicRow.data),
		privateSettings: privateRow.data
			? toPrivateSettings(privateRow.data)
			: {
					bankAccountName: null,
					bankAccountNumber: null,
					pickupAddress: null,
					notificationEmail: null,
				},
	};
}

export async function adminRules(): Promise<AvailabilityRule[]> {
	const supabase = await createClient();
	const { data } = await supabase
		.from("availability_rules")
		.select("*")
		.order("weekday", { ascending: true });
	return (data ?? []).map(toRule);
}

export async function adminOverrides(from: IsoDate, to: IsoDate): Promise<AvailabilityOverride[]> {
	const supabase = await createClient();
	const { data } = await supabase
		.from("availability_overrides")
		.select("*")
		.gte("date", from)
		.lte("date", to);
	return (data ?? []).map(toOverride);
}

export async function adminOrderCounts(
	from: IsoDate,
	to: IsoDate,
): Promise<Record<IsoDate, number>> {
	const supabase = await createClient();
	const { data } = await supabase.rpc("order_counts_between", { p_from: from, p_to: to });
	return countsFromRows(data ?? []);
}

export interface OrderFilters {
	status?: OrderStatus | "all" | "open";
	date?: IsoDate;
	search?: string;
	limit?: number;
}

export async function adminOrders(filters: OrderFilters = {}): Promise<OrderSummary[]> {
	const supabase = await createClient();

	let query = supabase
		.from("orders")
		.select("*, order_items (id)")
		.order("created_at", { ascending: false })
		.limit(filters.limit ?? 100);

	if (filters.status && filters.status !== "all") {
		if (filters.status === "open") {
			// Everything still needing attention.
			query = query.in("status", ["new", "confirmed", "ready"]);
		} else {
			query = query.eq("status", filters.status);
		}
	}

	if (filters.date) query = query.eq("pickup_date", filters.date);

	if (filters.search) {
		// Escape the PostgREST `or` separator so a comma in a search box cannot
		// inject extra filter clauses.
		const term = filters.search.replace(/[,()]/g, " ").trim();
		if (term) {
			query = query.or(
				`customer_name.ilike.%${term}%,customer_email.ilike.%${term}%,reference.ilike.%${term}%`,
			);
		}
	}

	const { data } = await query;

	return (data ?? []).map((row) => {
		const { order_items, ...rest } = row as typeof row & { order_items?: Array<{ id: string }> };
		const order = toOrder(rest as never);
		const { items: _items, ...summary } = order;
		return { ...summary, itemCount: order_items?.length ?? 0 };
	});
}

export async function adminOrder(id: string): Promise<Order | null> {
	const supabase = await createClient();
	const { data } = await supabase
		.from("orders")
		.select("*, order_items (*)")
		.eq("id", id)
		.maybeSingle();
	return data ? toOrder(data) : null;
}

export async function adminOrderEvents(orderId: string): Promise<OrderEvent[]> {
	const supabase = await createClient();
	const { data } = await supabase
		.from("order_events")
		.select("*")
		.eq("order_id", orderId)
		.order("created_at", { ascending: false })
		.limit(50);
	return (data ?? []).map(toOrderEvent);
}

/** Counts for the dashboard tiles. */
export async function adminDashboard(today: IsoDate, weekAhead: IsoDate) {
	const supabase = await createClient();

	const [newOrders, upcoming, needingAttention] = await Promise.all([
		supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "new"),
		supabase
			.from("orders")
			.select("*, order_items (id)")
			.gte("pickup_date", today)
			.lte("pickup_date", weekAhead)
			.neq("status", "cancelled")
			.order("pickup_date", { ascending: true }),
		supabase
			.from("orders")
			.select("id", { count: "exact", head: true })
			.lt("pickup_date", today)
			.in("status", ["new", "confirmed", "ready"]),
	]);

	return {
		newCount: newOrders.count ?? 0,
		overdueCount: needingAttention.count ?? 0,
		upcoming: (upcoming.data ?? []).map((row) => {
			const { order_items, ...rest } = row as typeof row & {
				order_items?: Array<{ id: string }>;
			};
			const order = toOrder(rest as never);
			const { items: _items, ...summary } = order;
			return { ...summary, itemCount: order_items?.length ?? 0 };
		}),
	};
}
