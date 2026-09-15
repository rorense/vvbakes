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
	Extra,
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
		optionGroups: [],
		imagePath: null,
		imageAlt: null,
		isAvailable: true,
		isFeatured: false,
		availabilityNote: null,
		allergens: [],
		sortOrder: 1,
		priceOnRequest: false,
		wantsBrief: false,
		...overrides,
	};
}

export const DEMO_PRODUCTS: Product[] = [
	// Mirrors the product seeded by
	// supabase/migrations/20260916000003_custom_cake_product.sql. It leads its
	// category because it is the thing she mostly makes, and it is the only one
	// here with no price: the sizes are questions, not price points.
	demoProduct({
		id: "demo-0",
		slug: "custom-cake",
		name: "Custom cake",
		categoryId: "demo-cat-3",
		description:
			"Tell me what you are after and I will come back to you with a price. The occasion, roughly how many people, flavours and colours — and a picture, if you have one.",
		unitPriceCents: 0,
		unitLabel: "cake",
		isFeatured: true,
		sortOrder: 0,
		priceOnRequest: true,
		wantsBrief: true,
		variantLabel: "Size",
		variants: [
			"Six to eight people",
			"Ten to twelve people",
			"Fifteen to twenty people",
			"Two tiers",
			"Not sure yet",
		].map((name, index) => ({
			id: `demo-0-v${index + 1}`,
			name,
			unitPriceCents: 0,
			imagePath: null,
			allergens: [],
			isAvailable: true,
			sortOrder: index + 1,
			optionIds: [],
		})),
	}),
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

/**
 * Stand-in extras, so a fresh clone shows the picker rather than a product page
 * that looks like the feature was never built.
 *
 * The real table is seeded with nothing on purpose — a price the owner never
 * agreed to charge has no business on a live page — but this catalogue is fake
 * from top to bottom and says so on every page that uses it.
 */
export const DEMO_EXTRAS: Extra[] = [
	{
		id: "demo-extra-1",
		name: "Birthday candles",
		description: "Six, in whatever colour goes with the icing.",
		priceCents: 300,
		isAvailable: true,
		sortOrder: 1,
	},
	{
		id: "demo-extra-2",
		name: "Gift box",
		description: "Ribbon and all, ready to hand over.",
		priceCents: 800,
		isAvailable: true,
		sortOrder: 2,
	},
	{
		id: "demo-extra-3",
		name: "Handwritten card",
		description: "Tell me what to write in the notes.",
		priceCents: 0,
		isAvailable: true,
		sortOrder: 3,
	},
];

export const DEMO_RULES: AvailabilityRule[] = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map(
	(weekday) => ({
		weekday,
		isOpen: weekday === 5 || weekday === 6,
		capacity: weekday === 5 || weekday === 6 ? 5 : 0,
	}),
);

export const DEMO_OVERRIDES: AvailabilityOverride[] = [];
