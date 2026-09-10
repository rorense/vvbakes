import "server-only";

import { cache } from "react";
import {
	DEMO_CATEGORIES,
	DEMO_OVERRIDES,
	DEMO_PRODUCTS,
	DEMO_RULES,
	DEMO_SETTINGS,
} from "./demo-data";
import { countsFromRows } from "./availability";
import type { IsoDate } from "./dates";
import { toCategory, toOverride, toProduct, toRule, toSettings } from "./mappers";
import { createClient } from "./supabase/server";
import { hasSupabaseConfig } from "./supabase/env";
import type {
	AvailabilityOverride,
	AvailabilityRule,
	Category,
	CategoryWithProducts,
	Product,
	SiteSettings,
} from "./types";

/**
 * Read helpers for the public site. Every one of these runs with the anonymous
 * key under row level security, so they can only ever see what a visitor may see.
 *
 * When Supabase is not configured they fall back to lib/demo-data.ts so a fresh
 * clone runs. That path is announced loudly: a warning in the server log and a
 * banner on the page.
 */

let warned = false;

/** True when the site is running on the built-in stand-in catalogue. */
export function isDemoMode(): boolean {
	const demo = !hasSupabaseConfig();
	if (demo && !warned) {
		warned = true;
		console.warn(
			"[vvbakes] NEXT_PUBLIC_SUPABASE_URL is not set — serving the built-in demo catalogue. " +
				"Copy .env.example to .env.local to connect a real database.",
		);
	}
	return demo;
}

export const getSettings = cache(async (): Promise<SiteSettings> => {
	if (isDemoMode()) return DEMO_SETTINGS;

	const supabase = await createClient();
	const { data, error } = await supabase.from("site_settings").select("*").eq("id", 1).single();

	if (error || !data) {
		// The settings row is created by the seed. If it is missing something is
		// badly wrong, but the site should still render rather than 500.
		console.error("[vvbakes] could not read site settings", error);
		return DEMO_SETTINGS;
	}
	return toSettings(data);
});

export const getCategories = cache(async (): Promise<Category[]> => {
	if (isDemoMode()) return DEMO_CATEGORIES;

	const supabase = await createClient();
	const { data, error } = await supabase
		.from("categories")
		.select("*")
		.order("sort_order", { ascending: true });

	if (error) {
		console.error("[vvbakes] could not read categories", error);
		return [];
	}
	return (data ?? []).map(toCategory);
});

const PRODUCT_SELECT = "*, product_price_tiers (qty, price_cents)";

export const getProducts = cache(async (): Promise<Product[]> => {
	if (isDemoMode()) return DEMO_PRODUCTS;

	const supabase = await createClient();
	const { data, error } = await supabase
		.from("products")
		.select(PRODUCT_SELECT)
		.order("sort_order", { ascending: true });

	if (error) {
		console.error("[vvbakes] could not read products", error);
		return [];
	}
	return (data ?? []).map(toProduct);
});

export const getProductBySlug = cache(async (slug: string): Promise<Product | null> => {
	if (isDemoMode()) return DEMO_PRODUCTS.find((product) => product.slug === slug) ?? null;

	const supabase = await createClient();
	const { data, error } = await supabase
		.from("products")
		.select(PRODUCT_SELECT)
		.eq("slug", slug)
		.maybeSingle();

	if (error || !data) return null;
	return toProduct(data);
});

/** Categories with their products attached, ready for the shop page. */
export const getCatalogue = cache(async (): Promise<CategoryWithProducts[]> => {
	const [categories, products] = await Promise.all([getCategories(), getProducts()]);

	const grouped = categories.map((category) => ({
		...category,
		products: products.filter((product) => product.categoryId === category.id),
	}));

	// A product whose category was deleted would otherwise silently disappear
	// from the shop, so it gets its own group at the end.
	const orphans = products.filter(
		(product) => !categories.some((category) => category.id === product.categoryId),
	);
	if (orphans.length > 0) {
		grouped.push({
			id: "uncategorised",
			name: "More treats",
			slug: "more",
			accent: "blush",
			sortOrder: 999,
			products: orphans,
		});
	}

	return grouped.filter((group) => group.products.length > 0);
});

export const getFeaturedProducts = cache(async (): Promise<Product[]> => {
	const products = await getProducts();
	const featured = products.filter((product) => product.isFeatured && product.isAvailable);
	// Always show something on the home page, even before anything is featured.
	return (featured.length > 0 ? featured : products.filter((p) => p.isAvailable)).slice(0, 3);
});

export const getAvailabilityRules = cache(async (): Promise<AvailabilityRule[]> => {
	if (isDemoMode()) return DEMO_RULES;

	const supabase = await createClient();
	const { data, error } = await supabase
		.from("availability_rules")
		.select("*")
		.order("weekday", { ascending: true });

	if (error) {
		console.error("[vvbakes] could not read availability rules", error);
		return [];
	}
	return (data ?? []).map(toRule);
});

export const getAvailabilityOverrides = cache(
	async (from: IsoDate, to: IsoDate): Promise<AvailabilityOverride[]> => {
		if (isDemoMode()) {
			return DEMO_OVERRIDES.filter((o) => o.date >= from && o.date <= to);
		}

		const supabase = await createClient();
		const { data, error } = await supabase
			.from("availability_overrides")
			.select("*")
			.gte("date", from)
			.lte("date", to);

		if (error) {
			console.error("[vvbakes] could not read availability overrides", error);
			return [];
		}
		return (data ?? []).map(toOverride);
	},
);

/** Active order counts per pickup date. Aggregate only — see the RPC's comment. */
export const getOrderCounts = cache(
	async (from: IsoDate, to: IsoDate): Promise<Record<IsoDate, number>> => {
		if (isDemoMode()) return {};

		const supabase = await createClient();
		const { data, error } = await supabase.rpc("order_counts_between", {
			p_from: from,
			p_to: to,
		});

		if (error) {
			console.error("[vvbakes] could not read order counts", error);
			return {};
		}
		return countsFromRows(data ?? []);
	},
);
