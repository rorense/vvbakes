import { beforeAll, describe, expect, it } from "vitest";
import type {
	CategoryWithProducts,
	Extra,
	Faq,
	Product,
	ProductOptionGroup,
	ProductVariant,
	SiteSettings,
} from "./types";

// Same pinning as lib/seo.test.ts, and for the same reason: every link in the
// output is absolute, and `siteUrl()` reads the environment when it is called.
beforeAll(() => {
	process.env.NEXT_PUBLIC_SITE_URL = "https://example.test";
});

const { llmsTxt } = await import("./llms");

function product(overrides: Partial<Product> = {}): Product {
	return {
		id: "00000000-0000-0000-0000-000000000001",
		slug: "cupcakes",
		name: "Cupcakes",
		description: null,
		categoryId: "00000000-0000-0000-0000-0000000000c1",
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

function extra(overrides: Partial<Extra> = {}): Extra {
	return {
		id: "00000000-0000-0000-0000-0000000000e1",
		name: "Candles",
		description: null,
		priceCents: 300,
		maxQty: 1,
		isAvailable: true,
		sortOrder: 1,
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

function category(overrides: Partial<CategoryWithProducts> = {}): CategoryWithProducts {
	return {
		id: "00000000-0000-0000-0000-0000000000c1",
		name: "Cupcakes",
		slug: "cupcakes",
		accent: "mint",
		sortOrder: 1,
		products: [product()],
		...overrides,
	};
}

/** The whole file, for a shop described by whatever is passed in. */
function build({
	settings: s = settings(),
	catalogue = [category()],
	faqs = [] as Faq[],
}: {
	settings?: SiteSettings;
	catalogue?: CategoryWithProducts[];
	faqs?: Faq[];
} = {}): string {
	return llmsTxt({ settings: s, catalogue, faqs });
}

/** The one line describing a product, pulled out of the file by its slug. */
function lineFor(file: string, slug: string): string {
	const line = file.split("\n").find((row) => row.includes(`/shop/${slug})`));
	if (!line) throw new Error(`no line for ${slug}`);
	return line;
}

describe("the shape llmstxt.org asks for", () => {
	it("opens with an H1 and a blockquote summary", () => {
		const lines = build().split("\n");
		expect(lines[0]).toBe("# vvbakes");
		expect(lines[1]).toBe("");
		expect(lines[2]).toMatch(/^> /);
	});

	it("names the city and the country in the summary", () => {
		// A search engine can be assumed to know which Auckland this is. A model
		// answering from this file alone cannot.
		expect(build().split("\n")[2]).toContain("Auckland, New Zealand");
	});

	it("puts every page under a heading, as links with a note each", () => {
		const file = build();
		expect(file).toContain("## Pages");
		expect(file).toContain(
			"- [Menu](https://example.test/shop): everything on offer, grouped by category, with prices",
		);
		expect(file).toContain("- [Terms](https://example.test/terms):");
		expect(file).toContain("- [Privacy](https://example.test/privacy):");
		expect(file).toContain("## Optional");
		expect(file).toContain("- [Sitemap](https://example.test/sitemap.xml)");
	});

	it("ends with a newline", () => {
		expect(build().endsWith("\n")).toBe(true);
	});
});

describe("what it refuses to say", () => {
	it("never prints the placeholder price of a product priced on request", () => {
		// `unitPriceCents` holds a number the product page itself refuses to show.
		// Publishing it here would quote a price the shop will not honour, which
		// is the promise `offerPrices` in lib/seo.ts makes to search engines.
		const custom = product({
			slug: "custom-cake",
			name: "Custom cake",
			unitPriceCents: 9900,
			priceOnRequest: true,
			priceGuide: [
				{ label: '6" - 2 layers', priceCents: 4500, isAddition: false },
				{ label: "Each extra tier", priceCents: 2000, isAddition: true },
			],
		});

		const line = lineFor(build({ catalogue: [category({ products: [custom] })] }), "custom-cake");

		expect(line).not.toContain("$99");
		expect(line).toContain("Price on request");
		expect(line).toContain('6" - 2 layers from $45');
		// An addition is "+ $20 for a second tier", not a price the cake can be
		// bought at, so it must not read as a starting price.
		expect(line).toContain("Each extra tier adds $20");
	});

	it("says a priced-on-request product has no guide rather than inventing one", () => {
		const custom = product({ slug: "one-off", priceOnRequest: true, unitPriceCents: 4200 });
		const line = lineFor(build({ catalogue: [category({ products: [custom] })] }), "one-off");

		expect(line).toContain("Price on request");
		expect(line).not.toContain("$42");
		expect(line).not.toContain("Starting prices");
	});

	it("never publishes the pickup address, only the suburb and the city", () => {
		const file = build({
			settings: settings({
				pickupSuburb: "Flat Bush, Auckland",
				pickupInstructions: "Text me when you pull up and I will bring it out.",
			}),
		});

		expect(file).toContain("Pickup is in Flat Bush, Auckland.");
		expect(file).toContain("is not published");
	});

	it("tells a reader that no allergens listed is not no allergens", () => {
		expect(build()).toContain(
			"A product with none listed here has had none declared yet, which is not the same as being free of them",
		);
	});

	it("links nothing that robots.txt disallows, and says why it has not", () => {
		// The guidance names those routes in prose on purpose, so this looks for
		// links to them rather than for the words. /menu is the unlisted market
		// card and /order/ is private to whoever holds the link.
		const links = build()
			.split("\n")
			.filter((line) => line.startsWith("- ["));

		for (const disallowed of ["/admin", "/menu", "/order/"]) {
			expect(links.some((line) => line.includes(`https://example.test${disallowed}`))).toBe(false);
		}
		expect(build()).toContain("Neither is public");
	});
});

describe("the suburb", () => {
	it("goes through localityLine, so the city is never said twice", () => {
		const file = build({ settings: settings({ pickupSuburb: "Flat Bush, Auckland" }) });
		expect(file).not.toContain("Auckland, Auckland");
	});

	it("falls back to the city when nothing is on file", () => {
		const file = build({ settings: settings({ pickupSuburb: null }) });
		expect(file).toContain("Pickup is in Auckland.");
	});
});

describe("a product line", () => {
	it("carries the menu price, the way the menu says it", () => {
		const tiered = product({
			slug: "cookies",
			name: "Cookies",
			unitPriceCents: 300,
			tiers: [{ qty: 4, priceCents: 1200 }],
		});

		expect(lineFor(build({ catalogue: [category({ products: [tiered] })] }), "cookies")).toContain(
			"$3 each · 4 for $12",
		);
	});

	it("lists the flavours, and marks a sold-out one rather than dropping it", () => {
		const flavoured = product({
			variants: [
				variant({ name: "Vanilla" }),
				variant({ id: "v2", name: "Carrot", isAvailable: false }),
			],
		});

		const line = lineFor(build({ catalogue: [category({ products: [flavoured] })] }), "cupcakes");
		expect(line).toContain("Flavour: Vanilla, Carrot (sold out).");
	});

	it("names every option group of a product that has more than one", () => {
		const groups: ProductOptionGroup[] = [
			{
				id: "g1",
				name: "Flavour",
				sortOrder: 1,
				options: [
					{
						id: "o1",
						name: "Chocolate",
						imagePath: null,
						allergens: [],
						isAvailable: true,
						sortOrder: 1,
					},
				],
			},
			{
				id: "g2",
				name: "Layers",
				sortOrder: 2,
				options: [
					{
						id: "o2",
						name: "3 layers",
						imagePath: null,
						allergens: [],
						isAvailable: true,
						sortOrder: 1,
					},
				],
			},
		];

		const line = lineFor(
			build({
				catalogue: [
					category({
						products: [
							product({ optionGroups: groups, variants: [variant({ optionIds: ["o1", "o2"] })] }),
						],
					}),
				],
			}),
			"cupcakes",
		);

		expect(line).toContain("Flavour: Chocolate.");
		expect(line).toContain("Layers: 3 layers.");
	});

	it("gathers the allergens from the product, the flavours and the options", () => {
		// The walnuts belong to the carrot flavour, and a line about the product
		// as a whole cannot say which flavour holds them. Under-declaring is the
		// failure that hurts somebody, so the union is what gets published.
		const flavoured = product({
			allergens: ["gluten"],
			variants: [
				variant({ name: "Vanilla" }),
				variant({ id: "v2", name: "Carrot", allergens: ["nuts"] }),
			],
		});

		const line = lineFor(build({ catalogue: [category({ products: [flavoured] })] }), "cupcakes");
		// In ALLERGENS order, not the order they were found in.
		expect(line).toContain("Allergens across the options: gluten and tree nuts.");
	});

	it("says nothing about allergens where none are declared", () => {
		expect(lineFor(build(), "cupcakes")).not.toContain("Allergens");
	});

	it("names the extras that are on offer, and leaves out the ones that are not", () => {
		const withExtras = product({
			extras: [
				extra({ name: "Gift box", priceCents: 500 }),
				extra({ id: "e2", name: "Candles", maxQty: 6 }),
				extra({ id: "e3", name: "Card", isAvailable: false }),
			],
		});

		const line = lineFor(build({ catalogue: [category({ products: [withExtras] })] }), "cupcakes");
		expect(line).toContain("Gift box (+$5)");
		expect(line).toContain("Candles (+$3 each)");
		expect(line).not.toContain("Card");
	});

	it("gives the minimum in whole steps, as the basket counts it", () => {
		const minis = product({
			slug: "mini-cupcakes",
			unitLabel: "box of 12",
			qtyStep: 12,
			minPerOrder: 24,
			unitPriceCents: 1750,
		});

		expect(
			lineFor(build({ catalogue: [category({ products: [minis] })] }), "mini-cupcakes"),
		).toContain("At least 24 per order.");
	});

	it("says a minimum is met across every flavour, the way the product page does", () => {
		const flavoured = product({
			minPerOrder: 4,
			variantLabel: "Flavour",
			variants: [variant({ name: "Vanilla" }), variant({ id: "v2", name: "Chocolate" })],
		});

		expect(
			lineFor(build({ catalogue: [category({ products: [flavoured] })] }), "cupcakes"),
		).toContain("At least 4 per order, across every flavour.");
	});

	it("counts a combination with its own minimum on its own", () => {
		// The pandan chiffon. Eight is a rule about slices, and the whole cake
		// sold beside them is one cake, so a single "at least 8" would quote the
		// slice rule at somebody buying the cake.
		const chiffon = product({
			slug: "pandan-chiffon-cake",
			variantLabel: "Size",
			minPerOrder: 8,
			variants: [
				variant({ name: "Slice" }),
				variant({ id: "v2", name: 'Whole 8" cake', unitPriceCents: 4500, minPerOrder: 1 }),
			],
		});

		const line = lineFor(
			build({ catalogue: [category({ products: [chiffon] })] }),
			"pandan-chiffon-cake",
		);

		expect(line).toContain("At least 8 per order, across every size but the ones named next.");
		expect(line).toContain('Whole 8" cake is counted on its own, with no minimum.');
	});

	it("drops the shared rule where every combination carries its own", () => {
		// The cookies: three packs of each topping, counted separately. The
		// product's own minimum governs nothing, and saying it would promise a
		// basket made of one of each, which is what those minimums refuse.
		const cookies = product({
			slug: "cookies",
			variantLabel: "Topping",
			minPerOrder: 3,
			variants: [
				variant({ name: "White chocolate drops", minPerOrder: 3 }),
				variant({ id: "v2", name: "Freeze dried strawberries", minPerOrder: 3 }),
			],
		});

		const line = lineFor(build({ catalogue: [category({ products: [cookies] })] }), "cookies");

		expect(line).toContain("At least 3 per order of each topping, counted separately.");
		expect(line).not.toContain("across every topping");
		// Said once, not once per topping.
		expect(line.match(/at least 3/gi)).toHaveLength(1);
	});

	it("names each one where they carry different minimums of their own", () => {
		const mixed = product({
			slug: "mixed",
			variantLabel: "Size",
			minPerOrder: 2,
			variants: [
				variant({ name: "Small", minPerOrder: 6 }),
				variant({ id: "v2", name: "Large", minPerOrder: 2 }),
			],
		});

		const line = lineFor(build({ catalogue: [category({ products: [mixed] })] }), "mixed");

		expect(line).toContain("Small: at least 6 per order, counted on its own.");
		expect(line).toContain("Large: at least 2 per order, counted on its own.");
		expect(line).not.toContain("across every size");
	});

	it("gives a combination its own number where it has one", () => {
		const boxed = product({
			slug: "boxes",
			minPerOrder: 2,
			variants: [variant({ name: "Small" }), variant({ id: "v2", name: "Large", minPerOrder: 6 })],
		});

		expect(lineFor(build({ catalogue: [category({ products: [boxed] })] }), "boxes")).toContain(
			"Large is counted on its own: at least 6 per order.",
		);
	});

	it("says nothing about a minimum of one step, the way the page says nothing", () => {
		expect(lineFor(build(), "cupcakes")).not.toContain("At least");
	});

	it("says when something is sold out", () => {
		const gone = product({ isAvailable: false, availabilityNote: "Back in October" });
		const line = lineFor(build({ catalogue: [category({ products: [gone] })] }), "cupcakes");

		expect(line).toContain("Sold out at the moment.");
		expect(line).toContain("Back in October.");
	});

	it("escapes brackets in a name, which is typed in the admin", () => {
		const odd = product({ slug: "boxed", name: "Cookies [box of 6]" });
		expect(lineFor(build({ catalogue: [category({ products: [odd] })] }), "boxed")).toContain(
			"[Cookies \\[box of 6\\]](https://example.test/shop/boxed)",
		);
	});
});

describe("a category section", () => {
	it("heads the category and links its page before its products", () => {
		const lines = build().split("\n");
		const heading = lines.indexOf("## Cupcakes");

		expect(heading).toBeGreaterThan(-1);
		expect(lines[heading + 2]).toContain(
			"[Cupcakes (category page)](https://example.test/shop/category/cupcakes)",
		);
		// The label is what stops this reading as the same link twice: the live
		// shop has a Cupcakes product inside a Cupcakes category.
		expect(lines[heading + 3]).toContain("[Cupcakes](https://example.test/shop/cupcakes)");
	});
});

describe("how an order works", () => {
	it("says there is no checkout and that payment follows confirmation", () => {
		const file = build();
		expect(file).toContain("nothing is paid at that point");
		expect(file).toContain("Payment is by bank transfer after that confirmation");
		expect(file).toContain("At least 2 days notice for regular orders.");
	});

	it("says orders are paused, in her words where she wrote some", () => {
		const paused = build({
			settings: settings({
				ordersOpen: false,
				ordersClosedMessage: "Taking a short break until October",
			}),
		});

		expect(paused).toContain(
			"Orders are paused at the moment. Taking a short break until October.",
		);
	});

	it("falls back to Instagram when she wrote no closed message", () => {
		expect(build({ settings: settings({ ordersOpen: false }) })).toContain(
			"Orders are paused at the moment. New dates go up on Instagram first.",
		);
	});

	it("says same-day where there is no lead time", () => {
		expect(build({ settings: settings({ leadTimeDays: 0 }) })).toContain("Same-day orders");
	});
});

describe("delivery", () => {
	it("says pickup only where delivery is off", () => {
		expect(build()).toContain("Pickup only: there is no delivery.");
	});

	it("says free where the fee is zero", () => {
		const file = build({ settings: settings({ deliveryEnabled: true }) });
		expect(file).toContain("Delivery is free.");
	});

	it("names the fee where there is one", () => {
		const file = build({
			settings: settings({ deliveryEnabled: true, deliveryFeeCents: 800 }),
		});
		expect(file).toContain("Delivery costs $8.");
	});

	it("says the fee is confirmed with the order where it depends on the address", () => {
		// The third state the settings carry. Nothing is charged at checkout, so
		// neither "free" nor a number is an honest answer here.
		const file = build({
			settings: settings({
				deliveryEnabled: true,
				deliveryFeeOnRequest: true,
				deliveryAreaText: "Around East Auckland",
			}),
		});

		expect(file).toContain(
			"Delivery: Around East Auckland. The delivery fee depends on the address",
		);
		expect(file).not.toContain("Delivery is free");
	});
});

describe("contact", () => {
	it("gives the email and phone where they are on file", () => {
		const file = build({
			settings: settings({ contactEmail: "hi@example.test", contactPhone: "021 000 000" }),
		});

		expect(file).toContain(
			"Contact: email hi@example.test, phone 021 000 000, Instagram @vv.bakes (https://www.instagram.com/vv.bakes/).",
		);
	});

	it("falls back to Instagram alone", () => {
		expect(build()).toContain("Contact: Instagram @vv.bakes");
	});
});

describe("the questions", () => {
	const faqs: Faq[] = [
		{ id: "f1", question: "Do you deliver?", answer: "Pickup only for now", sortOrder: 1 },
	];

	it("lists them, pointing at the band that answers them", () => {
		const file = build({ faqs });
		expect(file).toContain("## Questions");
		expect(file).toContain("- [Do you deliver?](https://example.test/#faq): Pickup only for now.");
	});

	it("drops the section when there are none, the way the home page drops the band", () => {
		expect(build()).not.toContain("## Questions");
	});
});

describe("text typed into the admin", () => {
	it("is collapsed onto one line, so a newline cannot break the list", () => {
		const wordy = product({
			description: "Two lines\n\nof description   with spacing",
		});

		expect(lineFor(build({ catalogue: [category({ products: [wordy] })] }), "cupcakes")).toContain(
			"Two lines of description with spacing.",
		);
	});

	it("keeps her own full stop rather than adding a second", () => {
		const file = build({ settings: settings({ aboutText: "I bake from home." }) });
		expect(file).toContain("A note from the baker: I bake from home.");
		expect(file).not.toContain("home..");
	});
});
