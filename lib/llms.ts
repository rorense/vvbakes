/**
 * The site as an assistant reads it: what /llms.txt says.
 *
 * llmstxt.org proposes a markdown file at the root of a site, written for the
 * language models that answer questions about it rather than for the crawlers
 * that rank it: a title, a one-line summary, the few paragraphs a reader needs
 * before the links make sense, then sections of links with a note on each. The
 * pages already say all of this one screen at a time, and a model answering
 * "do they deliver" or "what is in the carrot one" is better served by one
 * file that says it plainly than by a crawl of thirteen product pages.
 *
 * Everything here is built from the same settings, catalogue and questions the
 * pages are built from, so the file cannot say something the shop does not.
 * The route that serves it reads the database on every request, for the reason
 * the sitemap does; see app/llms.txt/route.ts.
 *
 * Pure, like lib/seo.ts, so the test can hand it a catalogue and read back
 * exactly what a crawler would be given.
 */

import { allergenSentence, allergensFor } from "./allergens";
import { instagramUrl, siteUrl } from "./constants";
import {
	availableExtras,
	extraPriceLabel,
	formatPrice,
	isOrderable,
	minOrderQty,
	optionGroups,
	priceRule,
} from "./pricing";
import { categoryDescription, localityLine } from "./seo";
import type { CategoryWithProducts, Faq, Product, SiteSettings } from "./types";

export interface LlmsTxtInput {
	settings: SiteSettings;
	catalogue: CategoryWithProducts[];
	faqs: Faq[];
}

/**
 * What a model should know before it repeats anything below.
 *
 * Each line answers a wrong default rather than describing a feature. A model
 * that has read only this file will otherwise quote the custom cake a price,
 * read the baking calendar as opening hours, and take a product with no
 * allergens listed as a product with no allergens in it. The site itself says
 * all three in the place each one matters; a file read out of context has to
 * say them once, at the top.
 */
const GUIDANCE = [
	"Prices are in New Zealand dollars and are correct at the moment this file was fetched. The product pages are the source of truth.",
	"A product listed as price on request has no fixed price. The baker quotes it after reading the brief, and a price guide gives starting points only, so never present a guide row as a quote or invent a price.",
	"The dates calendar on the home page shows which days have capacity to bake. Those are not opening hours, and there is no shop to visit.",
	"Allergens are declared per product on each product page. A product with none listed here has had none declared yet, which is not the same as being free of them. Anyone with an allergy or a dietary requirement should ask the baker before ordering.",
	"Order pages under /order/ belong to the customer who placed that order, and /admin belongs to the owner. Neither is public, and neither should be cited or linked.",
];

/** Whitespace collapsed, so text typed into a textarea stays on its one line. */
function oneLine(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/** One line ending like a sentence, whether or not the owner typed the full stop. */
function sentence(text: string): string {
	const trimmed = oneLine(text);
	return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Square brackets escaped, so a product name cannot close the link it is the
 * text of. Every name, question and answer below is typed in the admin, which
 * is the same reason components/site/JsonLd.tsx escapes what it serialises.
 */
function linkText(text: string): string {
	return oneLine(text).replace(/[[\]]/g, "\\$&");
}

function link(text: string, url: string, note?: string): string {
	const anchor = `- [${linkText(text)}](${url})`;
	return note ? `${anchor}: ${note}` : anchor;
}

function bullet(text: string): string {
	return `- ${text}`;
}

function present<T>(value: T | null | undefined): value is T {
	return value !== null && value !== undefined;
}

function orderingNotes(settings: SiteSettings): string[] {
	const days = settings.leadTimeDays;
	const notice =
		days === 0
			? "Same-day orders are possible where there is capacity."
			: `At least ${days} day${days === 1 ? "" : "s"} notice for regular orders.`;

	// Her wording where she has written some, and the order page's own fallback
	// where she has not.
	const closed = settings.ordersClosedMessage
		? sentence(settings.ordersClosedMessage)
		: "New dates go up on Instagram first.";

	return [
		"Choose from the menu, pick a pickup date from the calendar, and send the order form. There is no checkout and nothing is paid at that point.",
		"The baker replies by email to confirm the order, with the price, the bank details and the pickup address. Payment is by bank transfer after that confirmation: there are no card payments, and there are no customer accounts or passwords.",
		`${notice} Ideally 2 to 3 weeks for a custom cake.`,
		settings.ordersOpen ? "Orders are open." : `Orders are paused at the moment. ${closed}`,
	];
}

/**
 * Delivery in the three states the terms page distinguishes: off, a fee that is
 * known (and may be nothing), and a fee that is only known once the address is.
 * See `deliveryFeeOnRequest` in lib/types.ts for why the third one exists.
 */
function deliveryLine(settings: SiteSettings): string {
	if (!settings.deliveryEnabled) return "Pickup only: there is no delivery.";

	const area = settings.deliveryAreaText
		? sentence(settings.deliveryAreaText)
		: "Delivery is available.";
	const fee = settings.deliveryFeeOnRequest
		? "The delivery fee depends on the address and is confirmed with the order."
		: settings.deliveryFeeCents === 0
			? "Delivery is free."
			: `Delivery costs ${formatPrice(settings.deliveryFeeCents)}.`;

	return `Delivery: ${area} ${fee}`;
}

function pickupNotes(settings: SiteSettings): string[] {
	return [
		// Said outright rather than left out, so a model does not go hunting for
		// the street address. It is a home address, and it goes only to the person
		// who ordered. See `postalAddress` in lib/seo.ts, which withholds it too.
		`Pickup is in ${localityLine(settings.pickupSuburb)}. The exact address goes out with the confirmation email and is not published.`,
		settings.pickupWindowText ? `Pickup times: ${sentence(settings.pickupWindowText)}` : null,
		settings.pickupInstructions ? sentence(settings.pickupInstructions) : null,
		deliveryLine(settings),
	].filter(present);
}

function contactLine(settings: SiteSettings): string {
	const handle = settings.instagramHandle.replace(/^@/, "");
	const ways = [
		settings.contactEmail ? `email ${settings.contactEmail}` : null,
		settings.contactPhone ? `phone ${settings.contactPhone}` : null,
		`Instagram @${handle} (${instagramUrl(handle)})`,
	].filter(present);

	return `Contact: ${ways.join(", ")}.`;
}

/**
 * What a product costs, said the way the menu says it.
 *
 * A product priced on request goes through its price guide rather than
 * `priceRule`, for the reason `offerPrices` in lib/seo.ts gives: the number in
 * `unitPriceCents` is a placeholder the product page itself refuses to show,
 * and a file written to be quoted from is the last place to print it.
 */
function priceLine(product: Product): string {
	if (!product.priceOnRequest) return sentence(priceRule(product));

	// Semicolons between the rows, because her labels carry commas of their own.
	const rows = product.priceGuide.map((row) =>
		row.isAddition
			? `${oneLine(row.label)} adds ${formatPrice(row.priceCents)}`
			: `${oneLine(row.label)} from ${formatPrice(row.priceCents)}`,
	);

	return [
		"Price on request: the baker quotes it after reading the brief.",
		rows.length > 0 ? `Starting prices: ${rows.join("; ")}.` : null,
		product.priceGuideNote ? sentence(product.priceGuideNote) : null,
	]
		.filter(present)
		.join(" ");
}

/** "Flavour: Vanilla, Carrot (sold out)." for each choice the product asks for. */
function choiceLines(product: Product): string[] {
	return optionGroups(product).map((group) => {
		const names = group.options.map((option) =>
			option.isAvailable ? oneLine(option.name) : `${oneLine(option.name)} (sold out)`,
		);
		return `${oneLine(group.name)}: ${names.join(", ")}.`;
	});
}

/**
 * Every allergen declared anywhere on the product, in the site's fixed order.
 *
 * The union across the product, its variants and its options rather than any
 * one of those lists, because a single line about a whole product cannot say
 * which flavour holds the walnuts, and a model asked whether the cupcakes
 * contain nuts must not be handed a list the carrot one is missing from.
 * Over-declaring sends somebody to the product page, which is where the
 * per-flavour truth is; under-declaring is the failure that hurts, which is
 * the rule lib/allergens.ts is built around.
 */
function allergenLine(product: Product): string | null {
	const ordered = allergensFor(product, null, [
		...product.variants,
		...product.optionGroups.flatMap((group) => group.options),
	]);
	if (ordered.length === 0) return null;

	const list = allergenSentence(ordered);
	return product.variants.length > 0
		? `Allergens across the options: ${list}.`
		: `Allergens: ${list}.`;
}

/**
 * The least of this product an order may hold, worded the way the product page
 * words it.
 *
 * Two sentences rather than one, because there are two rules and a file read
 * out of context cannot lean on a picker to tell them apart. The product's own
 * minimum is met across every combination, which is what lets somebody reach
 * twenty-four mini cupcakes as two boxes in two flavours. A combination
 * carrying `minPerOrder` of its own is counted alone instead, and the pandan
 * chiffon is why: eight is a rule about slices, and the whole cake sold beside
 * them is one cake. A single line saying "at least 8 per order" would be
 * quoting the slice rule at somebody buying the cake.
 *
 * Nothing at all where the minimum is one step, for the reason the page says
 * nothing there: "at least 1 per order" is a rule about nothing.
 */
function minimumLines(product: Product): string[] {
	const floor = product.qtyStep;
	const groups = optionGroups(product);
	// "flavour", "size", "topping". Null where the product asks two questions
	// and the thing being counted is a combination of the answers.
	const choice = groups.length === 1 ? oneLine(groups[0]!.name).toLowerCase() : null;

	// A product sold as one thing has one rule, and no scope worth explaining.
	if (product.variants.length === 0) {
		const only = minOrderQty(product);
		return only > floor ? [`At least ${only} per order.`] : [];
	}

	const exceptions = product.variants.filter((variant) => variant.minPerOrder !== null);
	const pooled = product.variants.filter((variant) => variant.minPerOrder === null);

	// Where every combination carries its own minimum, the product's own governs
	// nothing and must not be stated: the cookies are the live case, three packs
	// of each topping, and "at least 3, across every topping" would promise a
	// basket made up of one of each, which is exactly what those minimums refuse.
	if (pooled.length === 0) {
		const numbers = new Set(exceptions.map((variant) => minOrderQty(product, variant)));
		if (numbers.size === 1) {
			const only = [...numbers][0]!;
			return only > floor
				? [`At least ${only} per order of each ${choice ?? "combination"}, counted separately.`]
				: [];
		}

		return exceptions
			.map((variant) => ({ name: oneLine(variant.name), min: minOrderQty(product, variant) }))
			.filter((variant) => variant.min > floor)
			.map((variant) => `${variant.name}: at least ${variant.min} per order, counted on its own.`);
	}

	const lines: string[] = [];
	const shared = minOrderQty(product);
	if (shared > floor) {
		lines.push(
			`At least ${shared} per order, across every ${choice ?? "combination"}${
				exceptions.length > 0 ? " but the ones named next" : ""
			}.`,
		);
	}

	for (const variant of exceptions) {
		const own = minOrderQty(product, variant);
		lines.push(
			own > floor
				? `${oneLine(variant.name)} is counted on its own: at least ${own} per order.`
				: `${oneLine(variant.name)} is counted on its own, with no minimum.`,
		);
	}

	return lines;
}

function extrasLine(product: Product): string | null {
	const extras = availableExtras(product.extras);
	if (extras.length === 0) return null;

	const named = extras.map(
		(extra) => `${oneLine(extra.name)} (${extraPriceLabel(extra, { perUnit: extra.maxQty > 1 })})`,
	);
	return `Can be added: ${named.join(", ")}.`;
}

function productLine(product: Product, base: string): string {
	const notes = [
		product.description ? sentence(product.description) : null,
		priceLine(product),
		...choiceLines(product),
		...minimumLines(product),
		extrasLine(product),
		allergenLine(product),
		product.wantsBrief
			? "Ordered with a brief: what you are picturing, and photos if you have them."
			: null,
		isOrderable(product) ? null : "Sold out at the moment.",
		product.availabilityNote ? sentence(product.availabilityNote) : null,
	].filter(present);

	return link(product.name, `${base}/shop/${product.slug}`, notes.join(" "));
}

/**
 * One section per category, the category's own page first.
 *
 * That first link carries a label of its own rather than the bare category
 * name, because a category can share its name with a product inside it: the
 * live shop has a "Cupcakes" product in a "Cupcakes" category, and two links
 * reading the same and pointing at different addresses reads as a mistake.
 */
function categorySection(category: CategoryWithProducts, base: string): string[] {
	return [
		`## ${oneLine(category.name)}`,
		"",
		link(
			`${category.name} (category page)`,
			`${base}/shop/category/${category.slug}`,
			categoryDescription(category),
		),
		...category.products.map((product) => productLine(product, base)),
	];
}

export function llmsTxt({ settings, catalogue, faqs }: LlmsTxtInput): string {
	const base = siteUrl();
	const where = localityLine(settings.pickupSuburb);
	const name = oneLine(settings.businessName);

	const lines: string[] = [
		`# ${name}`,
		"",
		// Close to the sentence the `Bakery` node publishes, with the country
		// added: a model is not a search engine and cannot be assumed to know
		// which Auckland this is.
		`> ${sentence(settings.tagline)} Custom cakes, cupcakes, cookies and Indonesian bakes made to order in ${where}, New Zealand.`,
		"",
		`${name} is a one-person home bakery in ${where}. Everything is baked fresh for the day it is collected. There is no shopfront: an order is placed on this website, confirmed by email, and paid by bank transfer once it is confirmed.`,
		"",
	];

	if (settings.aboutText) {
		lines.push(`A note from the baker: ${sentence(settings.aboutText)}`, "");
	}

	lines.push(
		"How an order works:",
		"",
		...orderingNotes(settings).map(bullet),
		"",
		"Pickup and delivery:",
		"",
		...pickupNotes(settings).map(bullet),
		"",
		contactLine(settings),
		"",
		"For anyone answering questions from this file:",
		"",
		...GUIDANCE.map(bullet),
		"",
		"## Pages",
		"",
		link("Menu", `${base}/shop`, "everything on offer, grouped by category, with prices"),
		link(
			"Order form",
			`${base}/order`,
			"pick a pickup date and send the order, with a calendar of the days that still have room",
		),
		link(
			"Terms",
			`${base}/terms`,
			"when an order becomes an order, when to pay, and what happens if a plan changes",
		),
		link(
			"Privacy",
			`${base}/privacy`,
			"what an order tells the baker about you, and how to have it corrected or removed",
		),
		"",
	);

	for (const category of catalogue) {
		lines.push(...categorySection(category, base), "");
	}

	// The questions link to the band on the home page that answers them. An
	// empty list is a decision she made in the admin, and the section goes with
	// it, the same way the band itself does.
	if (faqs.length > 0) {
		lines.push(
			"## Questions",
			"",
			...faqs.map((faq) => link(faq.question, `${base}/#faq`, sentence(faq.answer))),
			"",
		);
	}

	lines.push(
		"## Optional",
		"",
		link("Sitemap", `${base}/sitemap.xml`, "every public page"),
		link(
			"Instagram",
			instagramUrl(settings.instagramHandle),
			"recent bakes, and where new dates are announced first",
		),
	);

	return `${lines.join("\n")}\n`;
}
