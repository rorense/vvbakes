import { z } from "zod";
import { MAX_BRIEF_FLAVOUR, MAX_BRIEF_FROSTING, MAX_BRIEF_NOTE, MAX_BRIEF_URL } from "./brief";
import { ALLERGENS, ACCENTS } from "./types";

/**
 * Every shape that crosses a trust boundary.
 *
 * Server actions parse with these before touching the database. The database
 * then re-checks anything that matters (prices, capacity, quantities) inside the
 * transaction, so this layer is about giving people useful error messages rather
 * than about safety.
 */

const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Please choose a pickup date")
	.refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "That date isn't valid");

/**
 * A time off a clock — "16:30" from the order form's time input, or null.
 *
 * Seconds are accepted and dropped: no browser sends them from a time field,
 * and a collection time to the second is not a thing anyone meant. Anything
 * that is not a time at all becomes null rather than an error, in the same
 * spirit as `optionalText` below: the control is a native time input, so a
 * value it could not have produced is a caller hand-rolling the form rather
 * than a customer to be corrected.
 */
const clockTime = z
	.string()
	.trim()
	.regex(/^$|^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
	.transform((value) => (value === "" ? null : value.slice(0, 5)))
	.nullable()
	.catch(null);

const slug = z
	.string()
	.trim()
	.min(1)
	.max(80)
	.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only");

/** Money entered as dollars in the admin, stored as integer cents. */
const dollars = z
	.union([z.string(), z.number()])
	.transform((value) => (typeof value === "string" ? value.trim() : String(value)))
	.refine((value) => value !== "", "Enter a price")
	.refine((value) => /^\d+(\.\d{1,2})?$/.test(value), "Use a price like 3 or 12.50")
	.transform((value) => Math.round(Number(value) * 100));

/**
 * True when a string is an http(s) URL, and so safe to put in an href.
 *
 * A customer-supplied link is rendered in three places: the admin, the owner's
 * email and the customer's own order page. `new URL()` happily parses
 * `javascript:alert(1)`, so every one of those checks the scheme here rather
 * than trusting that the form validated it on the way in.
 */
export function isHttpUrl(value: string | null): boolean {
	if (!value) return false;
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

/** "pinterest.com/pin/1" becomes a real URL; an empty field becomes null. */
function withScheme(value: string): string | null {
	if (value === "") return null;
	return /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
}

/**
 * True when no two of these share a name.
 *
 * Case-folded, because "Vanilla" and "vanilla" are one flavour to a customer
 * reading the picker even though the unique index in the database would let
 * both through. Four lists are checked this way — a product's combinations,
 * its extras, its option groups, and the options in any one group — and they
 * have to agree, or the admin refuses a save the database would have taken or
 * the other way round.
 */
function namesAreUnique(rows: ReadonlyArray<{ name: string }>): boolean {
	const names = rows.map((row) => row.name.toLowerCase());
	return new Set(names).size === names.length;
}

/**
 * An email address the owner may leave blank, stored as null when she does.
 *
 * Two of these: the address customers reply to, and the one new orders are
 * announced at. Checked with `z.email()` after the empty case rather than
 * before, because an empty string is a real answer and not a malformed
 * address.
 */
const optionalEmail = z
	.string()
	.trim()
	.max(120)
	.transform((value) => (value === "" ? null : value))
	.nullable()
	.refine(
		(value) => value === null || z.email().safeParse(value).success,
		"That email address doesn't look right",
	);

const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.transform((value) => (value === "" ? null : value))
		.nullable()
		.catch(null);

/**
 * A link a customer typed, or null.
 *
 * `max` is left short of the column's 500 so that prepending a scheme to a bare
 * "pinterest.com/…" can never overflow it. The scheme is checked because this
 * is rendered as an href in the admin, in an email and on the customer's own
 * order page, and `new URL()` is perfectly happy to parse `javascript:`.
 */
const inspirationLink = z
	.string()
	.trim()
	.max(MAX_BRIEF_URL, "That link is too long to be a link")
	.transform(withScheme)
	.refine(
		(value) => value === null || isHttpUrl(value),
		"That link should start with http:// or https://",
	);

// --- ordering ---------------------------------------------------------------

const orderItemSchema = z.object({
	productId: z.string().uuid(),
	// Absent for a product sold as one thing. Which flavours exist, and whether
	// this one is still on sale, is the database's call inside place_order.
	variantId: z.string().uuid().nullable().optional(),
	// The extras added to this line. Absent means none, which is what most lines
	// are. Whether each one still exists and is still on sale is again the
	// database's call; the cap is here because a line with twenty things added to
	// it is a caller doing something other than ordering a cake.
	extraIds: z.array(z.string().uuid()).max(10).optional(),
	// What the customer said about this line: offered on every product, filled in
	// on very few. Matches the check constraint on `order_items.note`.
	note: z.string().trim().max(MAX_BRIEF_NOTE, "That note is longer than I can read").optional(),
	// And the link, where the product asked for one. Whether it asked is the
	// product page's business; a link on a line that did not is harmless and
	// still worth showing the owner.
	inspirationUrl: inspirationLink.optional(),
	// The flavour they asked for, where the product asked what flavour. Same
	// arrangement as the link: whether the question was put is the product
	// page's business, and an answer to one nobody asked is still an answer
	// worth showing her rather than a reason to refuse the order.
	customFlavour: z
		.string()
		.trim()
		.max(MAX_BRIEF_FLAVOUR, "That flavour is longer than I can fit on a cupcake")
		.optional(),
	// The frosting, and the tick box that stands in for it. Both are accepted
	// here and reconciled in `place_order`, which blanks the text when the box
	// is ticked — they are one answer to one question, and the column has a
	// constraint refusing a row that tries to give two.
	frosting: z
		.string()
		.trim()
		.max(MAX_BRIEF_FROSTING, "That's a longer description than the frosting needs")
		.optional(),
	frostingMatchesFlavour: z.boolean().optional(),
	qty: z.number().int().min(1).max(200),
});

export const orderInputSchema = z
	.object({
		// At least one: the custom cake is a product now, so there is no longer
		// such a thing as an order with nothing in it. The database still accepts
		// one for the sake of the orders already placed that way.
		items: z.array(orderItemSchema).min(1, "Your order is empty.").max(20),
		pickupDate: isoDate,
		// Optional, and mostly left empty. Someone with no preference has given a
		// real answer by saying nothing, so there is no default hour to fall back
		// on and nothing here refuses an order over it.
		pickupTime: clockTime,
		fulfilment: z.enum(["pickup", "delivery"]),
		customerName: z.string().trim().min(2, "Please tell us your name").max(80),
		customerEmail: z
			.string()
			.trim()
			.max(120)
			.pipe(z.email("That email address doesn't look right")),
		customerPhone: z.string().trim().min(6, "Please add a phone number").max(30),
		deliveryAddress: z.string().trim().max(300).optional(),
		notes: z.string().trim().max(1000).optional(),
	})
	.refine(
		(value) => value.fulfilment !== "delivery" || (value.deliveryAddress ?? "").trim().length > 0,
		{ message: "Please add a delivery address", path: ["deliveryAddress"] },
	);

// --- admin: products --------------------------------------------------------

const priceTierSchema = z.object({
	qty: z.coerce.number().int().min(2, "A bundle needs at least 2").max(1000),
	priceCents: dollars,
});

/** One option in one of a product's option groups: "Chocolate", "3 layers". */
const productOptionSchema = z.object({
	id: z.string().uuid().optional(),
	name: z.string().trim().min(1, "Give this one a name").max(60),
	/** Empty falls back to the product's photo. */
	imagePath: optionalText(400),
	/** Added to the product's allergens, never a replacement for them. */
	allergens: z.array(z.enum(ALLERGENS)),
	isAvailable: z.boolean(),
});

/**
 * One option group, with its options: "Flavour" — chocolate, carrot, red velvet.
 *
 * The form labels one of these **Variant** and its options **Options**, which
 * reads better over the boxes than "question" ever did. The code stops short of
 * following it, because `variants` below already means a priced combination,
 * all the way down to the `product_variants` table, and two meanings for one
 * word in one file is worse than a label that does not match its field.
 */
const productOptionGroupSchema = z.object({
	id: z.string().uuid().optional(),
	name: z.string().trim().min(1, "Give this one a name").max(30),
	options: z.array(productOptionSchema).min(1, "A variant needs an option").max(40),
});

/**
 * One combination a customer can buy, with the price they pay for it.
 *
 * The id is the existing row's, when there is one. It is what stops a save
 * re-creating every variant under new ids and cutting past orders loose from
 * the flavour they named.
 *
 * `options` says which option this combination takes from each group, as an
 * index into that group's options. Indexes rather than ids because most of
 * the options in a first save do not have ids yet — they are being created by
 * the same submission — and a position is something the form can always name.
 */
const productVariantSchema = z.object({
	id: z.string().uuid().optional(),
	name: z.string().trim().min(1, "Give this one a name").max(120),
	unitPriceCents: dollars,
	/** Empty falls back to an option's photo, then to the product's. */
	imagePath: optionalText(400),
	/** Added to the product's allergens, never a replacement for them. */
	allergens: z.array(z.enum(ALLERGENS)),
	isAvailable: z.boolean(),
	options: z.array(z.coerce.number().int().min(0)),
});

/**
 * One extra, as the product form submits it.
 *
 * The id is the existing row's, when there is one, and it is what keeps a past
 * order pointing at the extra it named. The lengths match the check constraints
 * on `product_extras`, so something too long comes back as a field error rather
 * than as a failed insert.
 */
const extraSchema = z.object({
	id: z.string().uuid().optional(),
	name: z
		.string()
		.trim()
		.min(1, "Every extra needs a name and a price")
		.max(60, "That name is longer than a name"),
	description: optionalText(200),
	priceCents: dollars,
	isAvailable: z.boolean(),
});

export const productSchema = z
	.object({
		id: z.string().uuid().optional(),
		name: z.string().trim().min(1, "Give it a name").max(80),
		slug,
		categoryId: z
			.string()
			.transform((value) => (value === "" ? null : value))
			.nullable()
			.refine(
				(value) => value === null || z.string().uuid().safeParse(value).success,
				"Choose a category",
			),
		description: optionalText(1000),
		unitPriceCents: dollars,
		unitLabel: z.string().trim().min(1, "e.g. each, slice, box of 6").max(30),
		qtyStep: z.coerce.number().int().min(1).max(100),
		minPerOrder: z
			.union([z.string(), z.number()])
			.transform((value) => (String(value).trim() === "" ? null : Number(value)))
			.nullable()
			.refine(
				(value) => value === null || (Number.isInteger(value) && value >= 1),
				"Leave blank for no minimum",
			),
		imagePath: optionalText(400),
		imageAlt: optionalText(200),
		isAvailable: z.boolean(),
		isFeatured: z.boolean(),
		availabilityNote: optionalText(120),
		allergens: z.array(z.enum(ALLERGENS)),
		sortOrder: z.coerce.number().int().min(0).max(9999),
		// No price until she has seen the brief. The price field is still
		// submitted and still stored — the form keeps showing it, greyed — because
		// switching this off again should bring back whatever was there rather
		// than a zero.
		priceOnRequest: z.boolean(),
		wantsBrief: z.boolean(),
		wantsCustomFlavour: z.boolean(),
		tiers: z.array(priceTierSchema).max(6),
		variantLabel: z.string().trim().min(1, "e.g. Flavour, Size").max(30),
		// Set only by turning the variants switch off, which is the one place the
		// form says out loud what removing them costs. See saveVariants.
		removeVariants: z.boolean(),
		// The combinations this save knows it is removing. Anything the save would
		// delete that is not in here is a form that has gone wrong, and is refused.
		removedVariants: z.array(z.string().uuid()).max(500),
		optionGroups: z.array(productOptionGroupSchema).max(5),
		// Every combination is a price typed by hand and a card the form renders,
		// so what bounds this is the grid staying usable rather than anything the
		// table could not hold. The cap is the form's own guard said again where it
		// cannot be skipped.
		variants: z
			.array(productVariantSchema)
			.max(500, "That is more combinations than one grid can ask you to fill in"),
		// What can be added to this product. Its own list, not a shared one, so two
		// products may each have a "Candles" at their own price.
		extras: z.array(extraSchema).max(20, "That is more extras than anyone will scroll past"),
	})
	.refine((value) => value.minPerOrder === null || value.minPerOrder % value.qtyStep === 0, {
		message: "The minimum has to be a multiple of the step size",
		path: ["minPerOrder"],
	})
	.refine((value) => new Set(value.tiers.map((tier) => tier.qty)).size === value.tiers.length, {
		message: "Two bundles have the same quantity",
		path: ["tiers"],
	})
	.refine((value) => namesAreUnique(value.variants), {
		message: "Two of these have the same name",
		path: ["variants"],
	})
	.refine((value) => namesAreUnique(value.extras), {
		message: "Two of those extras have the same name",
		path: ["extras"],
	})
	.refine((value) => namesAreUnique(value.optionGroups), {
		message: "Two of these variants have the same name",
		path: ["optionGroups"],
	})
	.refine((value) => value.optionGroups.every((group) => namesAreUnique(group.options)), {
		message: "Two options in one variant have the same name",
		path: ["optionGroups"],
	})
	// Option groups and combinations arrive together or not at all. A product
	// with groups nobody can buy an option from, or combinations built out of no
	// options at all, is a half-written product rather than a state the shop
	// knows how to render.
	.refine((value) => value.optionGroups.length > 0 === value.variants.length > 0, {
		message: "Something went wrong reading the variants. Please try again.",
		path: ["variants"],
	})
	// Every combination takes exactly one option from every group, and only
	// options that exist. The form builds these itself, so a mismatch is a bug
	// rather than something the owner typed, and it is refused rather than
	// half-saved.
	.refine(
		(value) =>
			value.variants.every(
				(variant) =>
					variant.options.length === value.optionGroups.length &&
					variant.options.every(
						(index, group) => index < (value.optionGroups[group]?.options.length ?? 0),
					),
			),
		{
			message: "Something went wrong reading the variants. Please try again.",
			path: ["variants"],
		},
	);

// --- admin: categories ------------------------------------------------------

export const categorySchema = z.object({
	id: z.string().uuid().optional(),
	name: z.string().trim().min(1, "Give it a name").max(60),
	slug,
	accent: z.enum(ACCENTS as unknown as [string, ...string[]]),
	sortOrder: z.coerce.number().int().min(0).max(9999),
});

// --- admin: availability ----------------------------------------------------

export const overrideSchema = z.object({
	date: isoDate,
	isOpen: z.boolean(),
	capacity: z
		.union([z.string(), z.number()])
		.transform((value) => (String(value).trim() === "" ? null : Number(value)))
		.nullable()
		.refine(
			(value) => value === null || (Number.isInteger(value) && value >= 0 && value <= 999),
			"Leave blank to use the usual number for that weekday",
		),
	note: optionalText(120),
});

export const blockRangeSchema = z
	.object({
		from: isoDate,
		to: isoDate,
		note: optionalText(120),
	})
	.refine((value) => value.from <= value.to, {
		message: "The end date has to be on or after the start date",
		path: ["to"],
	})
	.refine(
		(value) => {
			const days =
				(Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`)) / 86_400_000;
			return days <= 365;
		},
		{ message: "That's more than a year. Block a shorter range.", path: ["to"] },
	);

// --- admin: settings --------------------------------------------------------

/** What the owner quotes for custom work, entered in the admin. */
export const quoteSchema = z.object({
	id: z.string().uuid(),
	quoteCents: dollars,
});

/**
 * One row of the home page's questions list.
 *
 * The lengths match the check constraints on `faqs`, so an answer that is too
 * long comes back as a field error rather than as a failed insert.
 */
const faqSchema = z.object({
	question: z
		.string()
		.trim()
		.min(1, "Every question needs both a question and an answer")
		.max(200, "One of those questions is too long to read as a question"),
	answer: z
		.string()
		.trim()
		.min(1, "Every question needs both a question and an answer")
		.max(1500, "One of those answers is too long. Trim it a little."),
});

/**
 * One customer review.
 *
 * The lengths match the check constraints on `reviews`. `detail` is the line
 * under the name and is genuinely optional, so it becomes null rather than an
 * empty string.
 */
const reviewSchema = z.object({
	author: z
		.string()
		.trim()
		.min(1, "Every review needs a name and something they said")
		.max(80, "That name is longer than a name"),
	body: z
		.string()
		.trim()
		.min(1, "Every review needs a name and something they said")
		.max(800, "One of those reviews is too long. Quote the best part of it."),
	detail: optionalText(120),
});

export const settingsSchema = z.object({
	businessName: z.string().trim().min(1).max(60),
	tagline: z.string().trim().min(1).max(80),
	aboutText: optionalText(2000),
	pickupSuburb: optionalText(120),
	pickupInstructions: optionalText(1000),
	pickupWindowText: optionalText(120),
	leadTimeDays: z.coerce.number().int().min(0).max(60),
	cutoffTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use a time like 20:00"),
	bookingWindowDays: z.coerce.number().int().min(1).max(120),
	timezone: z.string().trim().min(1).max(60),
	ordersOpen: z.boolean(),
	ordersClosedMessage: optionalText(300),
	deliveryEnabled: z.boolean(),
	deliveryFeeCents: dollars,
	deliveryAreaText: optionalText(300),
	contactEmail: optionalEmail,
	contactPhone: optionalText(30),
	instagramHandle: z
		.string()
		.trim()
		.min(1)
		.max(40)
		.transform((value) => value.replace(/^@/, "")),
	// The home page's questions, submitted as one JSON field. An empty list is
	// valid and hides the section.
	faqs: z.array(faqSchema).max(20, "That is more questions than anyone will read"),
	// Kind words, same arrangement. Nothing is seeded, so an empty list is the
	// ordinary state rather than an error.
	reviews: z.array(reviewSchema).max(20, "That is more reviews than anyone will read"),
	// Private half. Stored separately and never rendered on a public page.
	bankAccountName: optionalText(80),
	bankAccountNumber: optionalText(40),
	pickupAddress: optionalText(300),
	notificationEmail: optionalEmail,
});

// --- helpers ----------------------------------------------------------------

/** Turns a Zod error into the `fieldErrors` shape server actions return. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const issue of error.issues) {
		const key = issue.path.join(".") || "form";
		errors[key] ??= issue.message;
	}
	return errors;
}

/** Reads a checkbox out of FormData. Unchecked boxes are simply absent. */
export function checkbox(form: FormData, name: string): boolean {
	const value = form.get(name);
	return value === "on" || value === "true" || value === "1";
}

/** Makes a URL-safe slug out of a product or category name. */
export function slugify(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}
