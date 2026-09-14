/**
 * Stand-in catalogue used only when Supabase is not configured.
 *
 * The point is that `npm run dev` works on a fresh clone, before anyone has
 * created a Supabase project, so the site can be designed and reviewed against
 * real-looking content. It mirrors supabase/seed.sql exactly.
 *
 * Every page that falls back to this also renders a banner saying so (see
 * components/site/DemoBanner.tsx), and `lib/queries.ts` logs a warning, so this
 * can never be mistaken for live data.
 */
import type {
	AvailabilityOverride,
	AvailabilityRule,
	Category,
	Product,
	SiteSettings,
	Weekday,
} from "./types";

export const DEMO_CATEGORIES: Category[] = [
	{
		id: "demo-cat-1",
		name: "Cupcakes",
		slug: "cupcakes",
		accent: "mint",
		sortOrder: 1,
	},
	{
		id: "demo-cat-2",
		name: "Cookies",
		slug: "cookies",
		accent: "butter",
		sortOrder: 2,
	},
	{
		id: "demo-cat-3",
		name: "Cakes & kue",
		slug: "cakes-and-kue",
		accent: "rose",
		sortOrder: 3,
	},
];

function demoProduct(overrides: Partial<Product> & Pick<Product, "id" | "slug" | "name">): Product {
	return {
		description: null,
		categoryId: null,
		unitPriceCents: 300,
		unitLabel: "each",
		qtyStep: 1,
		maxPerOrder: null,
		tiers: [],
		variantLabel: "Flavour",
		variants: [],
		imagePath: null,
		imageAlt: null,
		isAvailable: true,
		isFeatured: false,
		availabilityNote: null,
		allergens: [],
		sortOrder: 1,
		...overrides,
	};
}

export const DEMO_PRODUCTS: Product[] = [
	demoProduct({
		id: "demo-1",
		slug: "cupcakes",
		name: "Cupcakes",
		categoryId: "demo-cat-1",
		unitPriceCents: 300,
		unitLabel: "each",
		tiers: [{ qty: 4, priceCents: 1200 }],
		isFeatured: true,
		sortOrder: 1,
		allergens: ["gluten", "dairy", "egg"],
	}),
	demoProduct({
		id: "demo-2",
		slug: "cookies",
		name: "Cookies",
		categoryId: "demo-cat-2",
		description: "Each pack comes with two cookies.",
		unitPriceCents: 500,
		unitLabel: "pack",
		isFeatured: true,
		sortOrder: 2,
		allergens: ["gluten", "dairy", "egg"],
	}),
	demoProduct({
		id: "demo-3",
		slug: "brochi",
		name: "Brochi",
		categoryId: "demo-cat-3",
		unitPriceCents: 500,
		unitLabel: "slice",
		sortOrder: 3,
		allergens: ["gluten", "dairy", "egg"],
	}),
	demoProduct({
		id: "demo-4",
		slug: "wingko",
		name: "Wingko",
		categoryId: "demo-cat-3",
		unitPriceCents: 500,
		unitLabel: "slice",
		sortOrder: 4,
		allergens: ["egg"],
	}),
	demoProduct({
		id: "demo-5",
		slug: "pandan-chiffon-cake",
		name: "Pandan Chiffon Cake",
		categoryId: "demo-cat-3",
		unitPriceCents: 300,
		unitLabel: "slice",
		isFeatured: true,
		sortOrder: 5,
		allergens: ["gluten", "dairy", "egg"],
	}),
];

export const DEMO_SETTINGS: SiteSettings = {
	businessName: "vvbakes",
	tagline: "inspired desserts",
	aboutText:
		"Hi, I'm the baker behind vvbakes. Everything is made in small batches, to order, in my own kitchen, cupcakes and cookies alongside the Indonesian cakes I grew up with.",
	pickupSuburb: "Auckland",
	pickupInstructions: null,
	pickupWindowText: "Pickups 4–7pm",
	leadTimeDays: 2,
	cutoffTime: "20:00:00",
	bookingWindowDays: 28,
	timezone: "Pacific/Auckland",
	ordersOpen: true,
	ordersClosedMessage: null,
	deliveryEnabled: false,
	deliveryFeeCents: 0,
	deliveryAreaText: null,
	contactEmail: null,
	contactPhone: null,
	instagramHandle: "vv.bakes",
};

export const DEMO_RULES: AvailabilityRule[] = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map(
	(weekday) => ({
		weekday,
		isOpen: weekday === 5 || weekday === 6,
		capacity: weekday === 5 || weekday === 6 ? 5 : 0,
	}),
);

export const DEMO_OVERRIDES: AvailabilityOverride[] = [];
