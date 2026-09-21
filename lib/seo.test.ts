import { beforeAll, describe, expect, it } from "vitest";
import type { CategoryWithProducts, Faq, Product, ProductVariant, SiteSettings } from "./types";

// `siteUrl()` reads the environment at call time, and every builder below puts
// an absolute URL in its output. Pinning it here keeps the expectations in this
// file readable and stops them depending on where the suite happens to run.
beforeAll(() => {
	process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
});

const {
	bakeryId,
	bakeryJsonLd,
	catalogueItemListJsonLd,
	cataloguePriceRange,
	categoryDescription,
	categoryJsonLd,
	faqJsonLd,
	localityLine,
	offerPrices,
	postalAddress,
	productDescription,
	productJsonLd,
	productOffers,
} = await import("./seo");

function product(overrides: Partial<Product> = {}): Product {
	return {
		id: "00000000-0000-0000-0000-000000000001",
		slug: "cupcakes",
		name: "Cupcakes",
		description: null,
		categoryId: null,
		unitPriceCents: 300,
		unitLabel: "each",
		qtyStep: 1,
		minPerOrder: null,
		extraUnitPriceCents: null,
		tiers: [],
		priceGuide: [],
		priceGuideNote: null,
		variantLabel: "Flavour",
		variants: [],
		optionGroups: [],
		extras: [],
		imagePath: null,
		imageAlt: null,
		galleryImagePaths: [],
		isAvailable: true,
		isFeatured: false,
		availabilityNote: null,
		allergens: [],
		sortOrder: 1,
		priceOnRequest: false,
		wantsBrief: false,
		wantsCustomFlavour: false,
		mixVariants: false,
		wantsNote: true,
		noteHint: null,
		notePlaceholder: null,
		inspirationHint: null,
		briefNoun: null,
		...overrides,
	};
}

function variant(overrides: Partial<ProductVariant> = {}): ProductVariant {
	return {
		id: "00000000-0000-0000-0000-0000000000a1",
		name: "Vanilla",
		unitPriceCents: 300,
		imagePath: null,
		allergens: [],
		isAvailable: true,
		minPerOrder: null,
		sortOrder: 1,
		optionIds: [],
		...overrides,
	};
}

function settings(overrides: Partial<SiteSettings> = {}): SiteSettings {
	return {
		businessName: "vvbakes",
		tagline: "inspired desserts",
		aboutText: null,
		pickupSuburb: "Mt Roskill",
		pickupInstructions: null,
		pickupWindowText: null,
		leadTimeDays: 2,
		cutoffTime: "20:00:00",
		bookingWindowDays: 28,
		timezone: "Pacific/Auckland",
		ordersOpen: true,
		ordersClosedMessage: null,
		deliveryEnabled: false,
		deliveryFeeCents: 0,
		deliveryFeeOnRequest: false,
		deliveryAreaText: null,
		contactEmail: null,
		contactPhone: null,
		instagramHandle: "vv.bakes",
		...overrides,
	};
}

describe("localityLine", () => {
	it("adds the city to a bare suburb", () => {
		expect(localityLine("Mt Roskill")).toBe("Mt Roskill, Auckland");
	});

	it("leaves a suburb that already names the city alone", () => {
		// The admin's own placeholder suggests this shape, so it is the common
		// case rather than an edge one. Appending again gives "Auckland, Auckland".
		expect(localityLine("Mt Roskill, Auckland")).toBe("Mt Roskill, Auckland");
		expect(localityLine("Auckland")).toBe("Auckland");
		expect(localityLine("auckland central")).toBe("auckland central");
	});

	it("falls back to the city when nothing is on file", () => {
		expect(localityLine(null)).toBe("Auckland");
		expect(localityLine("   ")).toBe("Auckland");
	});
});

describe("postalAddress", () => {
	it("keeps the suburb as the locality and Auckland as the region", () => {
		expect(postalAddress(settings())).toEqual({
			"@type": "PostalAddress",
			addressLocality: "Mt Roskill",
			addressRegion: "Auckland",
			addressCountry: "NZ",
		});
	});

	it("splits a suburb that carries the city across the two fields", () => {
		// The live shop's setting is exactly this, and the first version of
		// `postalAddress` threw the suburb away and published "Auckland" twice.
		expect(postalAddress(settings({ pickupSuburb: "Flat Bush, Auckland" }))).toMatchObject({
			addressLocality: "Flat Bush",
			addressRegion: "Auckland",
		});
	});

	it("keeps a suburb whose own name contains the city", () => {
		expect(postalAddress(settings({ pickupSuburb: "Auckland Central" })).addressLocality).toBe(
			"Auckland Central",
		);
	});

	it("falls back to the city when there is nothing else to say", () => {
		expect(postalAddress(settings({ pickupSuburb: "Auckland" })).addressLocality).toBe("Auckland");
		expect(postalAddress(settings({ pickupSuburb: null })).addressLocality).toBe("Auckland");
		expect(postalAddress(settings({ pickupSuburb: " , Auckland " })).addressLocality).toBe(
			"Auckland",
		);
	});

	it("never publishes a street address", () => {
		// The pickup address is a home address. It goes out in the confirmation
		// email and nowhere a crawler can read it.
		expect(postalAddress(settings())).not.toHaveProperty("streetAddress");
	});
});

describe("offerPrices", () => {
	it("gives one price for a product with no variants", () => {
		expect(offerPrices(product())).toEqual({ low: 300, high: 300 });
	});

	it("multiplies by the step, because that is what one purchase costs", () => {
		expect(offerPrices(product({ unitPriceCents: 1750, qtyStep: 12 }))).toEqual({
			low: 21000,
			high: 21000,
		});
	});

	it("spans the available variants", () => {
		const cake = product({
			variants: [
				variant({ id: "a", unitPriceCents: 4500 }),
				variant({ id: "b", unitPriceCents: 5500 }),
			],
		});
		expect(offerPrices(cake)).toEqual({ low: 4500, high: 5500 });
	});

	it("ignores a sold-out variant at the cheap end", () => {
		const cake = product({
			variants: [
				variant({ id: "a", unitPriceCents: 4500, isAvailable: false }),
				variant({ id: "b", unitPriceCents: 5500 }),
			],
		});
		expect(offerPrices(cake)).toEqual({ low: 5500, high: 5500 });
	});

	it("publishes nothing for a product priced on request", () => {
		// `unitPriceCents` still holds a placeholder here, and the product page
		// refuses to show it. The markup must refuse it too.
		expect(offerPrices(product({ priceOnRequest: true, unitPriceCents: 9900 }))).toBeNull();
	});

	it("publishes a floor and no ceiling when there is a price guide", () => {
		const custom = product({
			priceOnRequest: true,
			unitPriceCents: 9900,
			priceGuide: [
				{ label: '6" - 2 layers', priceCents: 8000, isAddition: false },
				{ label: '8" - 3 layers', priceCents: 12000, isAddition: false },
				{ label: "Second tier", priceCents: 4000, isAddition: true },
			],
		});
		expect(offerPrices(custom)).toEqual({ low: 8000, high: null });
	});

	it("will not take an addition as the floor", () => {
		// "+ $40 for a second tier" is not a price the cake can be bought at.
		const custom = product({
			priceOnRequest: true,
			priceGuide: [{ label: "Second tier", priceCents: 4000, isAddition: true }],
		});
		expect(offerPrices(custom)).toBeNull();
	});
});

describe("productOffers", () => {
	it("emits a plain Offer when there is one price", () => {
		expect(productOffers(product())).toEqual({
			"@type": "Offer",
			priceCurrency: "NZD",
			availability: "https://schema.org/InStock",
			url: "https://example.test/shop/cupcakes",
			seller: { "@id": "https://example.test/#bakery" },
			price: "3.00",
			itemCondition: "https://schema.org/NewCondition",
		});
	});

	it("emits an AggregateOffer when the flavours differ", () => {
		const cake = product({
			variants: [
				variant({ id: "a", unitPriceCents: 4500 }),
				variant({ id: "b", unitPriceCents: 5500 }),
			],
		});
		expect(productOffers(cake)).toMatchObject({
			"@type": "AggregateOffer",
			lowPrice: "45.00",
			highPrice: "55.00",
			offerCount: 2,
		});
	});

	it("collapses to one Offer when every flavour is the same price", () => {
		const cupcakes = product({
			variants: [variant({ id: "a" }), variant({ id: "b" }), variant({ id: "c" })],
		});
		expect(productOffers(cupcakes)).toMatchObject({ "@type": "Offer", price: "3.00" });
	});

	it("marks a sold-out product out of stock rather than dropping it", () => {
		expect(productOffers(product({ isAvailable: false }))).toMatchObject({
			availability: "https://schema.org/OutOfStock",
		});
	});

	it("gives no offers at all where there is no honest price", () => {
		expect(productOffers(product({ priceOnRequest: true }))).toBeNull();
	});
});

describe("productJsonLd", () => {
	it("describes the product and points its seller at the bakery", () => {
		const data = productJsonLd({
			product: product(),
			category: { name: "Cupcakes" },
			images: ["https://cdn.test/a.webp", "https://cdn.test/b.webp"],
			description: "Small ones.",
		});

		expect(data).toMatchObject({
			"@type": "Product",
			"@id": "https://example.test/shop/cupcakes#product",
			name: "Cupcakes",
			description: "Small ones.",
			url: "https://example.test/shop/cupcakes",
			sku: "cupcakes",
			category: "Cupcakes",
			image: ["https://cdn.test/a.webp", "https://cdn.test/b.webp"],
		});
		expect(data.offers).toMatchObject({ seller: { "@id": bakeryId() } });
	});

	it("publishes an aggregateRating once the product has one", () => {
		const data = productJsonLd({
			product: product(),
			category: null,
			images: [],
			description: "Small ones.",
			rating: { productId: product().id, count: 4, average: 4.75 },
		});

		expect(data.aggregateRating).toEqual({
			"@type": "AggregateRating",
			// One decimal, not the two the function rounds to: "4.8" from four
			// opinions, not "4.75".
			ratingValue: 4.8,
			reviewCount: 4,
			bestRating: 5,
			worstRating: 1,
		});
	});

	it("publishes a whole number without a decimal point", () => {
		const data = productJsonLd({
			product: product(),
			category: null,
			images: [],
			description: "Small ones.",
			rating: { productId: product().id, count: 2, average: 5 },
		});
		expect(data.aggregateRating).toMatchObject({ ratingValue: 5, reviewCount: 2 });
	});

	it("emits no rating node for a product nobody has rated", () => {
		for (const rating of [null, { productId: "x", count: 0, average: 0 }]) {
			const data = productJsonLd({
				product: product(),
				category: null,
				images: [],
				description: "Small ones.",
				rating,
			});
			expect(data).not.toHaveProperty("aggregateRating");
		}
	});

	it("omits image and offers rather than emitting empty ones", () => {
		const data = productJsonLd({
			product: product({ priceOnRequest: true }),
			category: null,
			images: [],
			description: "Yours to describe.",
		});

		expect(data).not.toHaveProperty("image");
		expect(data).not.toHaveProperty("offers");
		expect(data).not.toHaveProperty("category");
	});
});

describe("productDescription", () => {
	it("prefers the owner's own words", () => {
		expect(productDescription(product({ description: "Six in a box." }))).toBe("Six in a box.");
	});

	it("writes a local one when she wrote none", () => {
		expect(productDescription(product())).toBe(
			"Cupcakes from vvbakes, baked to order in Auckland. $3 each.",
		);
	});

	it("does not invent a price for a product priced on request", () => {
		const text = productDescription(product({ priceOnRequest: true, unitPriceCents: 9900 }));
		expect(text).toContain("Priced to your brief");
		expect(text).not.toContain("99");
	});
});

describe("cataloguePriceRange", () => {
	it("spans the cheapest and dearest thing on the menu", () => {
		expect(
			cataloguePriceRange([
				product({ unitPriceCents: 300 }),
				product({ unitPriceCents: 5500, variants: [variant({ unitPriceCents: 5500 })] }),
			]),
		).toBe("$3 - $55");
	});

	it("reads as one price when everything costs the same", () => {
		expect(cataloguePriceRange([product(), product()])).toBe("$3");
	});

	it("skips products priced on request and products off the menu", () => {
		expect(
			cataloguePriceRange([
				product({ unitPriceCents: 300 }),
				product({ priceOnRequest: true, unitPriceCents: 99900 }),
				product({ unitPriceCents: 99900, isAvailable: false }),
			]),
		).toBe("$3");
	});

	it("is null for a catalogue with nothing priced", () => {
		expect(cataloguePriceRange([])).toBeNull();
		expect(cataloguePriceRange([product({ priceOnRequest: true })])).toBeNull();
	});
});

describe("bakeryJsonLd", () => {
	// Built per test rather than once in the describe body: the describe body
	// runs during collection, which is before `beforeAll` sets the site URL, so
	// a node built there would carry localhost.
	const open = () =>
		bakeryJsonLd({
			settings: settings({ contactEmail: "hi@example.test" }),
			ordersOpen: true,
			priceRangeText: "$3 - $55",
		});

	it("is a Bakery with a stable id the product pages can point at", () => {
		const node = open();
		expect(node["@type"]).toBe("Bakery");
		expect(node["@id"]).toBe("https://example.test/#bakery");
	});

	it("says where it is and how far it goes", () => {
		const node = open();
		expect(node.address).toMatchObject({
			addressLocality: "Mt Roskill",
			addressRegion: "Auckland",
		});
		expect(node.areaServed).toContainEqual({ "@type": "City", name: "Auckland" });
	});

	it("names the city in its description", () => {
		expect(open().description).toContain("Mt Roskill, Auckland");
	});

	it("claims no opening hours", () => {
		// The availability calendar is about baking capacity, and the pickup
		// window is free text. Neither is a promise that the shop is open.
		const node = open();
		expect(node).not.toHaveProperty("openingHoursSpecification");
		expect(node).not.toHaveProperty("openingHours");
	});

	it("drops the order action while orders are closed", () => {
		const closed = bakeryJsonLd({ settings: settings(), ordersOpen: false, priceRangeText: null });
		expect(closed).not.toHaveProperty("potentialAction");
		expect(closed).not.toHaveProperty("priceRange");
	});
});

describe("faqJsonLd", () => {
	const faqs: Faq[] = [
		{ id: "1", question: "Do you deliver?", answer: "Pickup only for now.", sortOrder: 1 },
	];

	it("turns the questions on the page into questions", () => {
		expect(faqJsonLd(faqs)).toEqual({
			"@context": "https://schema.org",
			"@type": "FAQPage",
			mainEntity: [
				{
					"@type": "Question",
					name: "Do you deliver?",
					acceptedAnswer: { "@type": "Answer", text: "Pickup only for now." },
				},
			],
		});
	});

	it("emits nothing at all for a shop with no FAQs", () => {
		expect(faqJsonLd([])).toBeNull();
	});
});

function category(overrides: Partial<CategoryWithProducts> = {}): CategoryWithProducts {
	return {
		id: "demo-cat-1",
		name: "Cupcakes",
		slug: "cupcakes",
		accent: "mint",
		sortOrder: 1,
		products: [],
		...overrides,
	};
}

describe("categoryDescription", () => {
	it("names what is actually in the category", () => {
		const text = categoryDescription(
			category({
				products: [
					product({ slug: "a", name: "Vanilla cupcakes" }),
					product({ slug: "b", name: "Red velvet cupcakes" }),
				],
			}),
		);
		expect(text).toContain("Cupcakes baked to order in Auckland");
		expect(text).toContain("Vanilla cupcakes and Red velvet cupcakes");
	});

	it("names at most three, so five categories do not read the same", () => {
		const text = categoryDescription(
			category({
				products: ["a", "b", "c", "d", "e"].map((s) => product({ slug: s, name: `Cake ${s}` })),
			}),
		);
		expect(text).toContain("Cake a, Cake b and Cake c");
		expect(text).not.toContain("Cake d");
	});

	it("prefers what is in stock", () => {
		const text = categoryDescription(
			category({
				products: [
					product({ slug: "a", name: "Sold out one", isAvailable: false }),
					product({ slug: "b", name: "In stock one" }),
				],
			}),
		);
		expect(text).toContain("In stock one");
		expect(text).not.toContain("Sold out one");
	});

	it("still says something for a category whose every product is sold out", () => {
		const text = categoryDescription(
			category({ products: [product({ name: "Sold out one", isAvailable: false })] }),
		);
		expect(text).toContain("Sold out one");
	});

	it("does not trail a stray colon when there is nothing to name", () => {
		expect(categoryDescription(category())).toBe(
			"Cupcakes baked to order in Auckland. Pick a date and collect them fresh, or ask for something made to your own brief.",
		);
	});
});

describe("categoryJsonLd", () => {
	const node = () =>
		categoryJsonLd(
			category({
				products: [
					product({ slug: "vanilla", name: "Vanilla cupcakes" }),
					product({ slug: "red-velvet", name: "Red velvet cupcakes" }),
				],
			}),
		);

	it("is a CollectionPage at the category's own URL", () => {
		expect(node()).toMatchObject({
			"@type": "CollectionPage",
			"@id": "https://example.test/shop/category/cupcakes#collection",
			url: "https://example.test/shop/category/cupcakes",
			name: "Cupcakes in Auckland",
		});
	});

	it("belongs to the same bakery the home page declares", () => {
		expect(node().isPartOf).toEqual({ "@id": bakeryId() });
	});

	it("links its products rather than inlining them", () => {
		const list = node().mainEntity;
		expect(list).toMatchObject({ "@type": "ItemList", numberOfItems: 2 });
		expect(list.itemListElement[0]).toEqual({
			"@type": "ListItem",
			position: 1,
			name: "Vanilla cupcakes",
			// The product's own page, not a URL under the category. One product
			// lives at one address.
			url: "https://example.test/shop/vanilla",
		});
		expect(list.itemListElement[0]).not.toHaveProperty("offers");
	});
});

describe("catalogueItemListJsonLd", () => {
	it("numbers the menu in the order it is scrolled", () => {
		const list = catalogueItemListJsonLd([
			{ slug: "cupcakes", name: "Cupcakes" },
			{ slug: "lapis-legit", name: "Lapis Legit" },
		]);

		expect(list).toMatchObject({ "@type": "ItemList", numberOfItems: 2 });
		expect(list?.itemListElement).toEqual([
			{
				"@type": "ListItem",
				position: 1,
				name: "Cupcakes",
				url: "https://example.test/shop/cupcakes",
			},
			{
				"@type": "ListItem",
				position: 2,
				name: "Lapis Legit",
				url: "https://example.test/shop/lapis-legit",
			},
		]);
	});

	it("emits nothing for an empty shop", () => {
		expect(catalogueItemListJsonLd([])).toBeNull();
	});
});
