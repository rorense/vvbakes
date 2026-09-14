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
import { addDays, todayIn, type IsoDate } from "./dates";
import { toCategory, toOverride, toProduct, toRule, toSettings } from "./mappers";
import { createPublicClient } from "./supabase/public";
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
 * Read helpers for the public site.
 *
 * These deliberately use the cookie-free client. Every table they touch has a
 * `using (true)` select policy, so an anonymous reader and the signed-in owner
 * see exactly the same rows, attaching the request's session bought nothing.
 * What it cost was the cache: a page that so much as touches `cookies()` is
 * dynamic, whatever `revalidate` says, which turned every visit to the home
 * page and the shop into a database round trip. It also made them impossible to
 * prerender, since `generateStaticParams` and `sitemap()` run without a request.
 *
 * Anything that genuinely depends on who is asking lives in lib/admin-queries.ts
 * and uses the session-scoped client there.
 *
 * When Supabase is not configured these fall back to lib/demo-data.ts so a fresh
 * clone runs. That path is announced loudly: a warning in the server log and a
 * banner on the page.
 */

/** Matches the check constraint on site_settings.booking_window_days. */
const MAX_BOOKING_WINDOW_DAYS = 120;

let warned = false;

/** True when the site is running on the built-in stand-in catalogue. */
export function isDemoMode(): boolean {
	const demo = !hasSupabaseConfig();
	if (demo && !warned) {
		warned = true;
		console.warn(
			"[vvbakes] NEXT_PUBLIC_SUPABASE_URL is not set, serving the built-in demo catalogue. " +
				"Copy .env.example to .env.local to connect a real database.",
		);
	}
	return demo;
}

export const getSettings = cache(async (): Promise<SiteSettings> => {
	if (isDemoMode()) return DEMO_SETTINGS;

	const supabase = createPublicClient();
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

	const supabase = createPublicClient();
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

const PRODUCT_SELECT =
	"*, product_price_tiers (qty, price_cents), product_variants (id, name, unit_price_cents, is_available, sort_order)";

const getProducts = cache(async (): Promise<Product[]> => {
	if (isDemoMode()) return DEMO_PRODUCTS;

	const supabase = createPublicClient();
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

/**
 * Product slugs for `generateStaticParams`.
 *
 * Deliberately separate from `getProducts`: this runs at build time, where
 * there is no request and therefore no cookies, so it uses the cookie-free
 * client. Using the request-scoped one here fails the build outright.
 */
export async function getProductSlugs(): Promise<string[]> {
	if (isDemoMode()) return DEMO_PRODUCTS.map((product) => product.slug);

	const { data, error } = await createPublicClient().from("products").select("slug");

	if (error) {
		// A build should not fail because the database was briefly unreachable.
		// Pages fall back to rendering on first request instead.
		console.warn("[vvbakes] could not list product slugs for prerendering", error.message);
		return [];
	}
	return (data ?? []).map((row) => row.slug);
}

export const getProductBySlug = cache(async (slug: string): Promise<Product | null> => {
	if (isDemoMode()) return DEMO_PRODUCTS.find((product) => product.slug === slug) ?? null;

	const supabase = createPublicClient();
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

const getAvailabilityRules = cache(async (): Promise<AvailabilityRule[]> => {
	if (isDemoMode()) return DEMO_RULES;

	const supabase = createPublicClient();
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

const getAvailabilityOverrides = cache(
	async (from: IsoDate, to: IsoDate): Promise<AvailabilityOverride[]> => {
		if (isDemoMode()) {
			return DEMO_OVERRIDES.filter((o) => o.date >= from && o.date <= to);
		}

		const supabase = createPublicClient();
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

/** Active order counts per pickup date. Aggregate only, see the RPC's comment. */
const getOrderCounts = cache(
	async (from: IsoDate, to: IsoDate): Promise<Record<IsoDate, number>> => {
		if (isDemoMode()) return {};

		const supabase = createPublicClient();
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

/**
 * Everything the availability calculation needs, in one round trip.
 *
 * The obvious shape, read settings, then use its timezone and booking window
 * to bound the override and count queries, costs two sequential round trips to
 * the database. On a page that is not cached that is the whole page weight: the
 * order form measured 1.6s in production, almost all of it waiting.
 *
 * So the date range is widened to a fixed window that is guaranteed to contain
 * whatever the settings ask for (the column caps `booking_window_days` at 120,
 * and a day either side covers every timezone), and everything is fetched at
 * once. The extra rows are nothing: overrides are sparse and the counts are
 * already aggregated.
 */
export async function getAvailabilityInputs() {
	// One day of slack each side absorbs the difference between the server's
	// date and the bakery's, whatever timezone is configured.
	const utcToday = todayIn("UTC");
	const from = addDays(utcToday, -1);
	const to = addDays(utcToday, MAX_BOOKING_WINDOW_DAYS + 1);

	const [settings, products, rules, overrides, counts] = await Promise.all([
		getSettings(),
		getProducts(),
		getAvailabilityRules(),
		getAvailabilityOverrides(from, to),
		getOrderCounts(from, to),
	]);

	return { settings, products, rules, overrides, counts };
}
