/**
 * Stand-in catalogue used only when Supabase is not configured.
 *
 * The point is that `npm run dev` works on a fresh clone, before anyone has
 * created a Supabase project, so the site can be designed and reviewed against
 * real-looking content.
 *
 * It follows supabase/seed.sql for the products themselves, which are the
 * printed market menu transcribed, but it is deliberately no longer the same
 * data. The seed puts nothing on a live shop that the owner has not agreed to
 * sell: no variants, no extras, no prices she never quoted. This has all three,
 * because a catalogue with none of them shows none of the shop's features and
 * a fresh clone would look like a simpler site than it is.
 *
 * So: every feature a product can have should be represented here by at least
 * one product, and `demo-6` exists only for that reason.
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
	InstagramPost,
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
		priceGuide: [],
		priceGuideNote: null,
		variantLabel: "Flavour",
		variants: [],
		optionGroups: [],
		extras: [],
		imagePath: null,
		imageAlt: null,
		isAvailable: true,
		isFeatured: false,
		availabilityNote: null,
		allergens: [],
		sortOrder: 1,
		priceOnRequest: false,
		wantsBrief: false,
		wantsCustomFlavour: false,
		wantsNote: true,
		noteHint: null,
		notePlaceholder: null,
		...overrides,
	};
}

export const DEMO_PRODUCTS: Product[] = [
	// Mirrors the product seeded by
	// supabase/migrations/20260916000003_custom_cake_product.sql. It leads its
	// category because it is the thing she mostly makes, and it is the only one
	// here with no price: the sizes are options, not price points.
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
		// The only product with these, because it is the only one with no price:
		// they are what a customer gets instead of one. Mirrors the guide seeded by
		// supabase/migrations/20260917000001_price_guide.sql.
		priceGuide: [
			{ label: '6" - 2 layers', priceCents: 4500, isAddition: false },
			{ label: '6" - 3 layers', priceCents: 5500, isAddition: false },
			{ label: '8" - 2 layers', priceCents: 6500, isAddition: false },
			{ label: '8" - 3 layers', priceCents: 7500, isAddition: false },
			{ label: "Additional layers", priceCents: 1000, isAddition: true },
		],
		priceGuideNote: "Custom designs and premium flavours may cost extra.",
		// A different list at a different price, which is the whole reason these
		// belong to a product rather than to the shop: candles for a tiered cake
		// are not the candles that go on a cupcake.
		extras: [
			{
				id: "demo-extra-4",
				name: "Candles and a sparkler",
				description: "Numbers or plain, and one sparkler for the top.",
				priceCents: 900,
				// Sold by the number, so the product page offers a picker rather than a
				// tick. The other two extras here are one or none and stay at 1.
				maxQty: 12,
				isAvailable: true,
				sortOrder: 1,
			},
			{
				id: "demo-extra-5",
				name: "Cake box and board",
				description: "Sturdy enough for a car boot.",
				priceCents: 1500,
				maxQty: 1,
				isAvailable: true,
				sortOrder: 2,
			},
		],
		variantLabel: "Size",
		// The same four sizes the guide above prices, in the same words, plus the
		// two it does not price. Renamed from the headcount brackets they were
		// seeded as by supabase/migrations/20260917000002_cake_sizes.sql.
		variants: [
			'6" - 2 layers',
			'6" - 3 layers',
			'8" - 2 layers',
			'8" - 3 layers',
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
		// Two products carry extras here so the demo catalogue shows both halves of
		// the feature: a product that offers some, and the several that offer none.
		// The real table is seeded with nothing, because a price the owner never
		// agreed to charge has no business on a live page.
		extras: [
			{
				id: "demo-extra-1",
				name: "Birthday candles",
				description: "In whatever colour goes with the icing.",
				priceCents: 300,
				// The case the picker was built for: a first birthday wants one and a
				// sixth wants six, and the tick box could only ever say "candles".
				maxQty: 24,
				isAvailable: true,
				sortOrder: 1,
			},
			{
				id: "demo-extra-2",
				name: "Gift box",
				description: "Ribbon and all, ready to hand over.",
				priceCents: 800,
				maxQty: 1,
				isAvailable: true,
				sortOrder: 2,
			},
			{
				id: "demo-extra-3",
				name: "Handwritten card",
				description: "Tell me what to write in the notes.",
				priceCents: 0,
				maxQty: 1,
				isAvailable: true,
				sortOrder: 3,
			},
		],
		// Mirrors what
		// supabase/migrations/20260916000004_custom_flavour.sql switches on for
		// the whole cupcakes category: a flavour of your own, a question about
		// the frosting, and somewhere to put the picture it came from.
		wantsCustomFlavour: true,
		wantsBrief: true,
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
		// The one product here that does not ask for a note, mirroring
		// supabase/migrations/20260918000001_product_note.sql. It comes how it
		// comes, and it is the only thing in demo mode that shows the switch off.
		wantsNote: false,
		allergens: ["gluten", "dairy", "egg"],
	}),
	// The only product here with two option groups, and the only reason it
	// exists: without one, nothing in demo mode renders an option group, and the
	// picker, the greying-out and the admin's price grid are all invisible to
	// anyone running a fresh clone.
	//
	// It is worth reading as the shape the real thing takes. The walnuts sit on
	// the "Carrot" option rather than on each of its three combinations, which is
	// what options carry allergens for. The matrix has a hole in it — there is no
	// three-layer lemon — because she does not make one, and a hole is a
	// combination left unpriced rather than a row switched off.
	demoProduct({
		id: "demo-6",
		slug: "celebration-cake",
		name: "Celebration cake",
		categoryId: "demo-cat-3",
		description:
			"Choose a flavour and how many layers. Every combination is priced on its own, so a three layer chocolate costs what a three layer chocolate costs.",
		// The fallback if the variants ever go. Every combination sets its own.
		unitPriceCents: 4500,
		unitLabel: "cake",
		sortOrder: 6,
		allergens: ["gluten", "dairy", "egg"],
		optionGroups: [
			{
				id: "demo-6-g1",
				name: "Flavour",
				sortOrder: 0,
				options: [
					{
						id: "demo-6-o-choc",
						name: "Chocolate",
						imagePath: null,
						allergens: [],
						isAvailable: true,
						sortOrder: 0,
					},
					{
						id: "demo-6-o-carrot",
						name: "Carrot",
						imagePath: null,
						// On the option, so it reaches all three carrot combinations.
						allergens: ["nuts"],
						isAvailable: true,
						sortOrder: 1,
					},
					{
						id: "demo-6-o-lemon",
						name: "Lemon",
						imagePath: null,
						allergens: [],
						isAvailable: true,
						sortOrder: 2,
					},
				],
			},
			{
				id: "demo-6-g2",
				name: "Layers",
				sortOrder: 1,
				options: [
					{
						id: "demo-6-o-one",
						name: "One layer",
						imagePath: null,
						allergens: [],
						isAvailable: true,
						sortOrder: 0,
					},
					{
						id: "demo-6-o-three",
						name: "Three layers",
						imagePath: null,
						allergens: [],
						isAvailable: true,
						sortOrder: 1,
					},
				],
			},
		],
		variantLabel: "Flavour",
		variants: [
			{
				id: "demo-6-v1",
				name: "Chocolate · One layer",
				unitPriceCents: 4500,
				optionIds: ["demo-6-o-choc", "demo-6-o-one"],
			},
			{
				id: "demo-6-v2",
				name: "Chocolate · Three layers",
				unitPriceCents: 7500,
				optionIds: ["demo-6-o-choc", "demo-6-o-three"],
			},
			{
				id: "demo-6-v3",
				name: "Carrot · One layer",
				unitPriceCents: 4800,
				optionIds: ["demo-6-o-carrot", "demo-6-o-one"],
			},
			{
				id: "demo-6-v4",
				name: "Carrot · Three layers",
				unitPriceCents: 7800,
				optionIds: ["demo-6-o-carrot", "demo-6-o-three"],
			},
			{
				id: "demo-6-v5",
				name: "Lemon · One layer",
				unitPriceCents: 4500,
				optionIds: ["demo-6-o-lemon", "demo-6-o-one"],
			},
			// No three layer lemon: the hole in the matrix.
		].map((variant, index) => ({
			...variant,
			imagePath: null,
			allergens: [],
			isAvailable: true,
			sortOrder: index + 1,
		})),
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
 * Empty for a duller reason than the reviews above.
 *
 * A demo post would need a demo picture, and the pictures for this feed live in
 * a Supabase bucket that a fresh clone has not got. Pointing these at anything
 * else would be inventing a second image pipeline to serve a fixture. The home
 * page drops the band when the feed is empty, which is also what a real site
 * does before the first sync has run, so demo mode shows the truthful thing.
 */
export const DEMO_INSTAGRAM_POSTS: InstagramPost[] = [];

/**
 * Stand-in extras, so a fresh clone shows the picker rather than a product page
 * that looks like the feature was never built.
 *
 * The real table is seeded with nothing on purpose — a price the owner never
 * agreed to charge has no business on a live page — but this catalogue is fake
 * from top to bottom and says so on every page that uses it.
 */
export const DEMO_RULES: AvailabilityRule[] = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map(
	(weekday) => ({
		weekday,
		isOpen: weekday === 5 || weekday === 6,
		capacity: weekday === 5 || weekday === 6 ? 5 : 0,
	}),
);

export const DEMO_OVERRIDES: AvailabilityOverride[] = [];
