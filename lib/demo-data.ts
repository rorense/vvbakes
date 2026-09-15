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
	Faq,
	Product,
	Review,
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
		minPerOrder: null,
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

/** Mirrors the questions seeded by supabase/migrations/20260915000006_faqs.sql. */
export const DEMO_FAQS: Faq[] = [
	{
		id: "demo-faq-1",
		question: "How much notice do you need?",
		answer:
			"The calendar only shows days I can still bake for, so anything you can pick, you can have. The good dates go first, so ask as soon as you know.",
		sortOrder: 1,
	},
	{
		id: "demo-faq-2",
		question: "What does it cost, and when do I pay?",
		answer:
			"Menu prices are on the shop page. A custom cake depends on the size and how much work goes on top, so I price it once I know what you're after. Nothing is charged here: I email you the price, the bank details and a reference, and you transfer it from there.",
		sortOrder: 2,
	},
	{
		id: "demo-faq-3",
		question: "Can you work around an allergy?",
		answer:
			"Everything on the menu lists what's in it, and I'll tell you the same for a custom cake. Some swaps are easy and some change the cake completely, so say something when you order rather than on the day.",
		sortOrder: 3,
	},
	{
		id: "demo-faq-4",
		question: "Can you make a cake I've seen online?",
		answer:
			"Send the photo through with your order. I'll tell you what I can match and what I'd do differently. Shape and colour travel better than an exact copy.",
		sortOrder: 4,
	},
	{
		id: "demo-faq-5",
		question: "Can I change or cancel an order?",
		answer:
			"Tell me as soon as you know. Nothing is final until I confirm it, and even after that I would far rather hear early than on the day.",
		sortOrder: 5,
	},
];

/**
 * Empty, and staying empty.
 *
 * Everything else here is placeholder content so a fresh clone looks like a
 * bakery. A placeholder review would be a sentence put in the mouth of someone
 * who never said it, which is a different thing from a placeholder price. The
 * band is hidden until the owner has a real one.
 */
export const DEMO_REVIEWS: Review[] = [];

export const DEMO_RULES: AvailabilityRule[] = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map(
	(weekday) => ({
		weekday,
		isOpen: weekday === 5 || weekday === 6,
		capacity: weekday === 5 || weekday === 6 ? 5 : 0,
	}),
);

export const DEMO_OVERRIDES: AvailabilityOverride[] = [];
