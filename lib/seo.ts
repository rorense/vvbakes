/**
 * Where the shop is, and how that gets said to a search engine.
 *
 * The site has always known its own pickup suburb, because the hero and the
 * footer print it. What it never said anywhere a crawler reads is the city, so
 * a page about cakes could not be found by anybody searching for cakes here.
 * That is what this file is for.
 *
 * The suburb stays in settings, where the owner can change it. The city, the
 * region and the country do not: moving the business to another city is not a
 * settings change, it is a different shop. Keeping them as constants means the
 * title tags, the descriptions and the structured data cannot disagree about
 * which Auckland is meant.
 */

import { SITE_NAME, instagramUrl, siteUrl } from "./constants";
import { formatPrice, hasVariants, priceRange } from "./pricing";
import type {
	Category,
	CategoryWithProducts,
	Faq,
	Product,
	ProductRating,
	SiteSettings,
} from "./types";

/** The city the shop bakes in. Part of the brand's address, not a preference. */
export const SITE_CITY = "Auckland";

/** Region and country in the form schema.org's PostalAddress wants. */
export const SITE_REGION = "Auckland";
export const SITE_COUNTRY = "NZ";

/** Every price on this site is in New Zealand dollars. */
export const CURRENCY = "NZD";

/**
 * The parts of Auckland an order can realistically reach, named for
 * `areaServed`.
 *
 * Deliberately the broad quadrants rather than a list of suburbs. A list of
 * suburbs is a list somebody has to maintain, it goes stale the first time she
 * drives somewhere new, and naming fifty places you do not actually serve is
 * the local-SEO equivalent of keyword stuffing. A handful of honest areas plus
 * the city itself says the same thing without the claim.
 */
export const AREAS_SERVED = [
	"Auckland",
	"Central Auckland",
	"East Auckland",
	"South Auckland",
	"West Auckland",
	"North Shore",
] as const;

/**
 * The shop's location as one readable phrase: "Mt Roskill, Auckland".
 *
 * The suburb is typed by hand in the admin, and the placeholder there already
 * suggests "Mt Roskill, Auckland", so plenty of real answers will carry the
 * city already. Appending it blindly would print "Auckland, Auckland" on the
 * seeded value and "Mt Roskill, Auckland, Auckland" on the suggested one, which
 * is exactly the sort of thing that makes a title tag look auto-generated.
 *
 * A shop with no suburb on file falls back to the city on its own, which is
 * true of every order regardless of what she has filled in.
 */
export function localityLine(suburb: string | null | undefined): string {
	const trimmed = suburb?.trim();
	if (!trimmed) return SITE_CITY;
	return mentionsCity(trimmed) ? trimmed : `${trimmed}, ${SITE_CITY}`;
}

/**
 * Whether a hand-typed suburb already names the city.
 *
 * Word-boundary rather than `includes`, so a suburb that merely contains the
 * letters is not mistaken for the city. Nothing in Auckland is called that
 * today; the check costs nothing and stops the question being asked again.
 */
function mentionsCity(suburb: string): boolean {
	return new RegExp(`\\b${SITE_CITY}\\b`, "i").test(suburb);
}

/**
 * The suburb on its own, with the city taken back off the end.
 *
 * `addressLocality` and `addressRegion` are different fields, so a setting of
 * "Flat Bush, Auckland" has to be split between them rather than put in one and
 * dropped from the other. The first version of this discarded the whole setting
 * whenever it named the city, which turned the live shop's "Flat Bush,
 * Auckland" into a locality of "Auckland": the region repeated, and the suburb
 * that actually says where she is gone from the markup entirely.
 *
 * Split on commas rather than by stripping the word, because the word is also
 * how some suburbs are named. "Auckland Central" survives as a locality; a
 * trailing ", Auckland" does not.
 */
function localityOnly(suburb: string): string | null {
	const parts = suburb
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0 && part.toLowerCase() !== SITE_CITY.toLowerCase());

	return parts[0] ?? null;
}

/**
 * The address block shared by every structured-data node that carries one.
 *
 * `streetAddress` is deliberately absent. This is a home kitchen: the pickup
 * address goes out in the confirmation email to the person who ordered, and
 * publishing it on every page is not a trade the owner agreed to. A locality,
 * a region and a country are enough for a search engine to place the business
 * in the right city, which is the whole point of the exercise.
 */
export function postalAddress(settings: Pick<SiteSettings, "pickupSuburb">) {
	const suburb = settings.pickupSuburb?.trim();

	return {
		"@type": "PostalAddress",
		// The city is the region, so a suburb that names it too would otherwise
		// print it twice over. Falls back to the city for a shop that has filled
		// in nothing, or nothing beyond the city itself.
		addressLocality: (suburb ? localityOnly(suburb) : null) ?? SITE_CITY,
		addressRegion: SITE_REGION,
		addressCountry: SITE_COUNTRY,
	};
}

/**
 * The id every other node points at when it means "this bakery".
 *
 * Structured data on separate pages describes one business, and saying so
 * explicitly is what lets a crawler merge the product pages' seller with the
 * home page's bakery rather than inventing two. The fragment never resolves to
 * anything and is not meant to: it is a name, not a link.
 */
export function bakeryId(): string {
	return `${siteUrl()}/#bakery`;
}

/**
 * What one product costs, as the two numbers an `AggregateOffer` wants.
 *
 * Null where there is no honest number to give: a product priced on request
 * has a placeholder in `unitPriceCents` that the page itself refuses to show,
 * and putting it in the markup instead would be quoting a price to Google that
 * the shop will not honour. A price guide is a real answer to "where does this
 * start", so a custom cake with one gets its floor published and no ceiling.
 */
export function offerPrices(product: Product): { low: number; high: number | null } | null {
	if (product.priceOnRequest) {
		if (product.priceGuide.length === 0) return null;
		// Additions are "+ $20 for a second tier", not a price the cake can be
		// bought at, so they cannot be the floor.
		const starts = product.priceGuide.filter((row) => !row.isAddition).map((r) => r.priceCents);
		if (starts.length === 0) return null;
		return { low: Math.min(...starts), high: null };
	}

	if (!hasVariants(product)) {
		const unit = product.unitPriceCents * product.qtyStep;
		return unit > 0 ? { low: unit, high: unit } : null;
	}

	// Sold-out flavours are left out for the reason `unitPriceRange` leaves them
	// out: a range a customer cannot buy either end of is worse than no range.
	const sellable = product.variants.filter((variant) => variant.isAvailable);
	const prices = (sellable.length > 0 ? sellable : product.variants)
		.map((variant) => variant.unitPriceCents * product.qtyStep)
		.filter((cents) => cents > 0);
	if (prices.length === 0) return null;

	return { low: Math.min(...prices), high: Math.max(...prices) };
}

/** Cents to the decimal string schema.org expects: 1750 becomes "17.50". */
function priceValue(cents: number): string {
	return (cents / 100).toFixed(2);
}

/**
 * The `offers` block for one product, or null where there is no price to give.
 *
 * A single `Offer` where every way of buying the thing costs the same, an
 * `AggregateOffer` where the flavours differ, and a floor-only aggregate for a
 * custom cake with a price guide. Google reads all three; the distinction
 * matters because an `Offer` carrying a range is not a thing, and a product
 * whose eight flavours are all $6 does not need an aggregate to say so.
 */
export function productOffers(product: Product) {
	const prices = offerPrices(product);
	if (!prices) return null;

	const availability = product.isAvailable
		? "https://schema.org/InStock"
		: "https://schema.org/OutOfStock";

	const common = {
		priceCurrency: CURRENCY,
		availability,
		url: `${siteUrl()}/shop/${product.slug}`,
		seller: { "@id": bakeryId() },
	};

	if (prices.high === null) {
		return { "@type": "AggregateOffer", ...common, lowPrice: priceValue(prices.low) };
	}

	if (prices.low === prices.high) {
		return {
			"@type": "Offer",
			...common,
			price: priceValue(prices.low),
			itemCondition: "https://schema.org/NewCondition",
		};
	}

	const offerCount = product.variants.filter((variant) => variant.isAvailable).length;

	return {
		"@type": "AggregateOffer",
		...common,
		lowPrice: priceValue(prices.low),
		highPrice: priceValue(prices.high),
		...(offerCount > 0 ? { offerCount } : {}),
	};
}

/**
 * A product as schema.org sees it.
 *
 * `image` takes the gallery as well as the main photo, because Google picks
 * whichever crop suits the result and giving it one photo to pick from is how
 * a product ends up in a text-only listing. The caller passes fully qualified
 * URLs; this file does not know where the bucket lives.
 */
export function productJsonLd({
	product,
	category,
	images,
	description,
	rating = null,
}: {
	product: Product;
	category: Pick<Category, "name"> | null;
	images: readonly string[];
	description: string;
	/**
	 * This product's score, when anybody has given it one. Null is the ordinary
	 * state and publishes no `aggregateRating` at all, which is the only honest
	 * answer for a product nobody has rated: an empty rating node is worth less
	 * than none and earns a structured-data warning besides.
	 *
	 * On the product rather than on the bakery, and that is the whole point of
	 * collecting these. Google will not show stars for a business's rating of
	 * itself: "If the entity that's being reviewed controls the reviews about
	 * itself, their pages that use LocalBusiness or any other type of
	 * Organization structured data are ineligible for star review feature." A
	 * rating of a cake is not that.
	 */
	rating?: ProductRating | null;
}) {
	const offers = productOffers(product);

	return {
		"@context": "https://schema.org",
		"@type": "Product",
		"@id": `${siteUrl()}/shop/${product.slug}#product`,
		name: product.name,
		description,
		url: `${siteUrl()}/shop/${product.slug}`,
		...(images.length > 0 ? { image: [...images] } : {}),
		sku: product.slug,
		brand: { "@type": "Brand", name: SITE_NAME },
		...(category ? { category: category.name } : {}),
		...(offers ? { offers } : {}),
		...(rating && rating.count > 0
			? {
					aggregateRating: {
						"@type": "AggregateRating",
						// One decimal place. The function rounds to two, which would
						// publish "4.67" against a count of three and imply a precision
						// three opinions do not have.
						ratingValue: Number(rating.average.toFixed(1)),
						reviewCount: rating.count,
						bestRating: 5,
						worstRating: 1,
					},
				}
			: {}),
	};
}

/**
 * The bakery itself: who she is, where she bakes, how far she goes.
 *
 * `Bakery` rather than the plainer `LocalBusiness` because it is the specific
 * type, and a specific type is always worth more than a general one. There is
 * no `openingHoursSpecification` and that is on purpose: the availability
 * calendar is about which days she has capacity to bake, which is a different
 * claim from "the shop is open 9 to 5", and the pickup window is free text she
 * types by hand. Publishing either as opening hours would be telling a search
 * engine something the business has not promised.
 */
export function bakeryJsonLd({
	settings,
	ordersOpen,
	priceRangeText,
}: {
	settings: SiteSettings;
	ordersOpen: boolean;
	priceRangeText: string | null;
}) {
	const base = siteUrl();

	return {
		"@context": "https://schema.org",
		"@type": "Bakery",
		"@id": bakeryId(),
		name: settings.businessName,
		description: `${settings.tagline}. Custom cakes, cupcakes, cookies and Indonesian bakes made to order in ${localityLine(settings.pickupSuburb)}.`,
		url: base,
		image: `${base}/opengraph-image.png`,
		logo: `${base}/icon-512.png`,
		sameAs: [instagramUrl(settings.instagramHandle)],
		address: postalAddress(settings),
		areaServed: AREAS_SERVED.map((name) => ({ "@type": "City", name })),
		servesCuisine: ["Bakery", "Desserts", "Indonesian"],
		currenciesAccepted: CURRENCY,
		paymentAccepted: "Bank transfer",
		hasMenu: `${base}/shop`,
		...(priceRangeText ? { priceRange: priceRangeText } : {}),
		...(settings.contactEmail ? { email: settings.contactEmail } : {}),
		...(settings.contactPhone ? { telephone: settings.contactPhone } : {}),
		...(ordersOpen ? { potentialAction: { "@type": "OrderAction", target: `${base}/order` } } : {}),
	};
}

/**
 * The cheapest and dearest thing on the menu, as `priceRange` wants it.
 *
 * Derived from the catalogue rather than typed in, so it cannot drift from what
 * the shop actually charges, and null for a catalogue with nothing priced yet.
 * Products priced on request are skipped: their `unitPriceCents` is a
 * placeholder and quoting it here would put a number on the page that the
 * product's own page refuses to show.
 */
export function cataloguePriceRange(products: readonly Product[]): string | null {
	const prices = products
		.filter((product) => !product.priceOnRequest && product.isAvailable)
		.flatMap((product) =>
			hasVariants(product)
				? product.variants.map((variant) => variant.unitPriceCents * product.qtyStep)
				: [product.unitPriceCents * product.qtyStep],
		)
		.filter((cents) => cents > 0);

	if (prices.length === 0) return null;

	const low = Math.min(...prices);
	const high = Math.max(...prices);
	return low === high ? formatPrice(low) : `${formatPrice(low)} - ${formatPrice(high)}`;
}

/**
 * The questions on the home page, marked up as questions.
 *
 * Worth being honest about what this buys. Google narrowed FAQ rich results to
 * government and health sites in 2023, so this will not put an accordion under
 * the listing. It is still read by Bing, by the assistants that answer from
 * structured data rather than from a crawl, and by Google's own sense of what
 * the page is about. The markup costs one script tag and the answers already
 * exist, so it earns its place even without the stars.
 */
export function faqJsonLd(faqs: readonly Faq[]) {
	if (faqs.length === 0) return null;

	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: faqs.map((faq) => ({
			"@type": "Question",
			name: faq.question,
			acceptedAnswer: { "@type": "Answer", text: faq.answer },
		})),
	};
}

/**
 * The shop page's products as an ordered list.
 *
 * Positions run across the whole page rather than restarting per category, so
 * the list describes the page as a visitor scrolls it. Each entry is a URL
 * rather than an inlined product: the product's own page already carries the
 * full markup, and repeating it here would ship the entire catalogue twice.
 */
export function catalogueItemListJsonLd(entries: ReadonlyArray<{ slug: string; name: string }>) {
	if (entries.length === 0) return null;

	const base = siteUrl();

	return {
		"@context": "https://schema.org",
		"@type": "ItemList",
		name: `The ${SITE_NAME} menu`,
		numberOfItems: entries.length,
		itemListElement: entries.map((entry, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: entry.name,
			url: `${base}/shop/${entry.slug}`,
		})),
	};
}

/**
 * What a category page says about itself, in prose and in its meta tag.
 *
 * Built from what is actually in the category rather than written per
 * category, because a category is created in the admin and nothing there asks
 * her for a description. Naming two or three of the products is what stops
 * five of these pages reading as the same sentence with the noun swapped,
 * which is the failure mode of every auto-generated category page.
 */
export function categoryDescription(category: CategoryWithProducts): string {
	const sellable = category.products.filter((product) => product.isAvailable);
	const shown = (sellable.length > 0 ? sellable : category.products).slice(0, 3);
	const names = shown.map((product) => product.name);

	const list =
		names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];

	const opener = list
		? `${category.name} baked to order in ${SITE_CITY}: ${list}`
		: `${category.name} baked to order in ${SITE_CITY}`;

	return `${opener}. Pick a date and collect them fresh, or ask for something made to your own brief.`;
}

/**
 * A category page as schema.org sees it: a `CollectionPage` wrapping an
 * `ItemList` of what is on it.
 *
 * The products are linked rather than inlined for the reason the shop page's
 * list links rather than inlines. Each product page already carries a full
 * `Product` node with its own offer, and repeating all of that here would put
 * the same catalogue in the markup three times over.
 */
export function categoryJsonLd(category: CategoryWithProducts) {
	const base = siteUrl();
	const url = `${base}/shop/category/${category.slug}`;

	return {
		"@context": "https://schema.org",
		"@type": "CollectionPage",
		"@id": `${url}#collection`,
		name: `${category.name} in ${SITE_CITY}`,
		description: categoryDescription(category),
		url,
		isPartOf: { "@id": bakeryId() },
		mainEntity: {
			"@type": "ItemList",
			numberOfItems: category.products.length,
			itemListElement: category.products.map((product, index) => ({
				"@type": "ListItem",
				position: index + 1,
				name: product.name,
				url: `${base}/shop/${product.slug}`,
			})),
		},
	};
}

/** What a product page says about itself when the owner wrote no description. */
export function productDescription(product: Product): string {
	if (product.description) return product.description;

	const price = product.priceOnRequest ? "Priced to your brief" : priceRange(product);
	return `${product.name} from ${SITE_NAME}, baked to order in ${SITE_CITY}. ${price}.`;
}
