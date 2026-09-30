import "server-only";

import { cache } from "react";
import { INSTAGRAM_FEED_LIMIT } from "./constants";
import {
	DEMO_CATEGORIES,
	DEMO_FAQS,
	DEMO_INSTAGRAM_POSTS,
	DEMO_OVERRIDES,
	DEMO_PRODUCTS,
	DEMO_REVIEWS,
	DEMO_RULES,
	DEMO_SETTINGS,
} from "./demo-data";
import { countsFromRows } from "./availability";
import { addDays, todayIn, type IsoDate } from "./dates";
import {
	PRODUCT_SELECT,
	toCategory,
	toFaq,
	toInstagramPost,
	toOverride,
	toProduct,
	toReview,
	toRule,
	toSettings,
} from "./mappers";
import { isOrderable } from "./pricing";
import { createPublicClient } from "./supabase/public";
import { hasSupabaseConfig } from "./supabase/env";
import type {
	AvailabilityOverride,
	AvailabilityRule,
	Category,
	CategoryWithProducts,
	Faq,
	InstagramPost,
	Product,
	ProductRating,
	Review,
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
		// Throw rather than fall back to the demo settings. Those carry no contact
		// details, a zero delivery fee and orders open, and they reached customer
		// emails, the feedback cron and an admin's delivery-fee edit as if they were
		// the shop's own. A cached page that fails to regenerate keeps serving its
		// last good render, and a build fails rather than baking the demo in.
		throw new Error("[vvbakes] could not read site settings", { cause: error });
	}
	return toSettings(data);
});

/** The categories, or a thrown error. Pages want `getCategories`, which cannot throw. */
async function readCategories(): Promise<Category[]> {
	if (isDemoMode()) return DEMO_CATEGORIES;

	const supabase = createPublicClient();
	const { data, error } = await supabase
		.from("categories")
		.select("*")
		.order("sort_order", { ascending: true });

	if (error) throw new Error("[vvbakes] could not read categories", { cause: error });
	return (data ?? []).map(toCategory);
}

export const getCategories = cache(async (): Promise<Category[]> => {
	try {
		return await readCategories();
	} catch (error) {
		console.error(error);
		return [];
	}
});

/**
 * The home page's questions, in the order the owner arranged them.
 *
 * An empty list is a legitimate answer and not an error: the section is hidden
 * rather than shown empty, so a bakery that would rather not answer anything in
 * public simply deletes them all.
 */
export const getFaqs = cache(async (): Promise<Faq[]> => {
	if (isDemoMode()) return DEMO_FAQS;

	const supabase = createPublicClient();
	const { data, error } = await supabase
		.from("faqs")
		.select("*")
		.order("sort_order", { ascending: true });

	if (error) {
		console.error("[vvbakes] could not read the questions", error);
		return [];
	}
	return (data ?? []).map(toFaq);
});

/**
 * The reviews the owner has chosen to show, in her order.
 *
 * Empty until she types one in, and empty is the normal state of a new site
 * rather than a failure: the home page drops the band instead of asking for
 * kind words it has not been given.
 */
export const getReviews = cache(async (): Promise<Review[]> => {
	if (isDemoMode()) return DEMO_REVIEWS;

	const supabase = createPublicClient();
	const { data, error } = await supabase
		.from("reviews")
		.select("*")
		.order("sort_order", { ascending: true });

	if (error) {
		console.error("[vvbakes] could not read the reviews", error);
		return [];
	}
	return (data ?? []).map(toReview);
});

/**
 * The Instagram feed, as the cron last left it.
 *
 * A plain table read like any other. Nothing here talks to Instagram: the daily
 * job in lib/instagram.ts does that, copies the pictures into our own bucket,
 * and writes these rows. So the feed renders at the same speed as the shop,
 * keeps working while Instagram is down, and costs a visitor no request to
 * Meta. See supabase/migrations/20260917000004_instagram.sql.
 */
export const getInstagramPosts = cache(async (): Promise<InstagramPost[]> => {
	if (isDemoMode()) return DEMO_INSTAGRAM_POSTS;

	const supabase = createPublicClient();
	const { data, error } = await supabase
		.from("instagram_posts")
		.select("*")
		.order("posted_at", { ascending: false })
		.limit(INSTAGRAM_FEED_LIMIT);

	if (error) {
		console.error("[vvbakes] could not read the Instagram feed", error);
		return [];
	}
	return (data ?? []).map(toInstagramPost);
});

// Extras have no query of their own: they belong to a product and ride in on
// `PRODUCT_SELECT`, the same way a product's bundle prices and flavours do.

/** Every product, or a thrown error. Pages want `getProducts`, which cannot throw. */
async function readProducts(): Promise<Product[]> {
	if (isDemoMode()) return DEMO_PRODUCTS;

	const supabase = createPublicClient();
	const { data, error } = await supabase
		.from("products")
		.select(PRODUCT_SELECT)
		.order("sort_order", { ascending: true });

	if (error) throw new Error("[vvbakes] could not read products", { cause: error });
	return (data ?? []).map(toProduct);
}

const getProducts = cache(async (): Promise<Product[]> => {
	try {
		return await readProducts();
	} catch (error) {
		console.error(error);
		return [];
	}
});

/**
 * Product slugs for `generateStaticParams`: one narrow column rather than the
 * whole catalogue join, since that is all a build needs to know. Anything that
 * also wants the categories should read `getCatalogue` once and take both.
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
	return groupCatalogue(categories, products);
});

/**
 * The same catalogue, except that a failed read throws instead of reading as a
 * shop with nothing in it.
 *
 * For the sitemap. A page that renders an empty shop during an outage is a bad
 * minute; a sitemap that answers 200 with no products tells every crawler that
 * reads it the shop has none, and they act on that. A thrown error answers 500,
 * which crawlers retry rather than believe.
 */
export async function readCatalogue(): Promise<CategoryWithProducts[]> {
	const [categories, products] = await Promise.all([readCategories(), readProducts()]);
	return groupCatalogue(categories, products);
}

function groupCatalogue(categories: Category[], products: Product[]): CategoryWithProducts[] {
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
}

/**
 * One category and everything in it, for its own page.
 *
 * Built on `getCatalogue` rather than querying the category alone, so it
 * inherits the same two rules: an empty category is not in the list, and the
 * synthetic "More treats" group that catches orphaned products is. That second
 * one matters — a product whose category was deleted is still reachable from
 * its group on the shop page, so the group needs a page of its own or the link
 * goes nowhere.
 */
export const getCategoryBySlug = cache(
	async (slug: string): Promise<CategoryWithProducts | null> => {
		const catalogue = await getCatalogue();
		return catalogue.find((category) => category.slug === slug) ?? null;
	},
);

/**
 * Every product's rating, keyed by product id.
 *
 * Through the `product_rating_summary()` function rather than a select,
 * because the ratings table has no public read policy: a row there is close
 * enough to naming a customer at this shop's size, and the average and the
 * count are all the markup needs. See the migration.
 *
 * An empty map is the ordinary answer for a shop that has collected nothing
 * yet, and every caller treats a missing product as "no rating" rather than as
 * an error. Nothing on the page depends on this, so a failure here costs the
 * stars and not the page.
 */
export const getProductRatings = cache(async (): Promise<Map<string, ProductRating>> => {
	const ratings = new Map<string, ProductRating>();
	if (isDemoMode()) return ratings;

	const supabase = createPublicClient();
	const { data, error } = await supabase.rpc("product_rating_summary");

	if (error) {
		console.error("[vvbakes] could not read product ratings", error);
		return ratings;
	}

	for (const row of data ?? []) {
		// `numeric` comes back from PostgREST as a string, so the average has to
		// be parsed rather than trusted to be a number.
		const average = Number(row.rating_average);
		if (!Number.isFinite(average) || row.rating_count < 1) continue;

		ratings.set(row.product_id, {
			productId: row.product_id,
			count: row.rating_count,
			average,
		});
	}

	return ratings;
});

/**
 * Category slugs for `generateStaticParams`.
 *
 * Unlike `getProductSlugs` this can go through `getCatalogue`, because a
 * category's page depends on which products are in it: a category prerendered
 * from the categories table alone would build pages for empty ones, which the
 * route then 404s. Reading the catalogue is the only way to know which slugs
 * are real.
 */
export async function getCategorySlugs(): Promise<string[]> {
	const catalogue = await getCatalogue();
	return catalogue.map((category) => category.slug);
}

/**
 * What the bar at the foot of a phone's screen prices the basket against.
 *
 * The site layout reads this for every page, because the basket lives in the
 * visitor's browser and the server drawing the page cannot see what is in it.
 * Only what can still be bought: a saved line naming anything else is dropped
 * before it is priced, by the order form and the bar alike, so the rest would
 * be bytes every visitor downloads to throw away.
 *
 * Read in the page's own render rather than fetched by the browser from a
 * route of its own. That keeps the bar exactly as fresh as the prices printed
 * on the page around it, and `revalidateCatalogue()` already purges every page
 * that carries it. A catalogue cached somewhere else is a second copy that can
 * go stale without anyone noticing; app/sitemap.ts says how that went.
 */
export const getOrderableProducts = cache(async (): Promise<Product[]> => {
	const products = await getProducts();
	return products.filter(isOrderable);
});

export const getFeaturedProducts = cache(async (): Promise<Product[]> => {
	const products = await getProducts();
	const orderable = products.filter(isOrderable);
	const featured = orderable.filter((product) => product.isFeatured);
	// Always show something on the home page, even before anything is featured.
	return (featured.length > 0 ? featured : orderable).slice(0, 3);
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
