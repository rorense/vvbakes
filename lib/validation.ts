import { z } from "zod";
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

const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.transform((value) => (value === "" ? null : value))
		.nullable()
		.catch(null);

// --- ordering ---------------------------------------------------------------

const orderItemSchema = z.object({
	productId: z.string().uuid(),
	qty: z.number().int().min(1).max(200),
});

export const orderInputSchema = z
	.object({
		// May be empty: a custom cake enquiry has nothing off the menu in it. The
		// refinement below makes sure the order is still *something*.
		items: z.array(orderItemSchema).max(20),
		pickupDate: isoDate,
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
		customRequest: z.string().trim().max(2000).optional(),
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
		maxPerOrder: z
			.union([z.string(), z.number()])
			.transform((value) => (String(value).trim() === "" ? null : Number(value)))
			.nullable()
			.refine(
				(value) => value === null || (Number.isInteger(value) && value >= 1),
				"Leave blank for no limit",
			),
		imagePath: optionalText(400),
		imageAlt: optionalText(200),
		isAvailable: z.boolean(),
		isFeatured: z.boolean(),
		availabilityNote: optionalText(120),
		allergens: z.array(z.enum(ALLERGENS)),
		sortOrder: z.coerce.number().int().min(0).max(9999),
		tiers: z.array(priceTierSchema).max(6),
	})
	.refine((value) => value.maxPerOrder === null || value.maxPerOrder % value.qtyStep === 0, {
		message: "The maximum has to be a multiple of the step size",
		path: ["maxPerOrder"],
	})
	.refine((value) => new Set(value.tiers.map((tier) => tier.qty)).size === value.tiers.length, {
		message: "Two bundles have the same quantity",
		path: ["tiers"],
	});

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
	contactEmail: z
		.string()
		.trim()
		.max(120)
		.transform((value) => (value === "" ? null : value))
		.nullable()
		.refine(
			(value) => value === null || z.email().safeParse(value).success,
			"That email address doesn't look right",
		),
	contactPhone: optionalText(30),
	instagramHandle: z
		.string()
		.trim()
		.min(1)
		.max(40)
		.transform((value) => value.replace(/^@/, "")),
	// Private half. Stored separately and never rendered on a public page.
	bankAccountName: optionalText(80),
	bankAccountNumber: optionalText(40),
	pickupAddress: optionalText(300),
	notificationEmail: z
		.string()
		.trim()
		.max(120)
		.transform((value) => (value === "" ? null : value))
		.nullable()
		.refine(
			(value) => value === null || z.email().safeParse(value).success,
			"That email address doesn't look right",
		),
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
