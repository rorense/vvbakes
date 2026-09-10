/**
 * Application-shaped types. Database rows arrive snake_case from Supabase and
 * are converted once, in lib/mappers.ts, so nothing above that layer has to
 * think about column names.
 */

export type OrderStatus = "new" | "confirmed" | "ready" | "collected" | "cancelled";
export type Fulfilment = "pickup" | "delivery";

/** The pastel a category paints its band and cards with. */
export type Accent = "rose" | "blush" | "butter" | "mint" | "peach";
export const ACCENTS: readonly Accent[] = ["rose", "blush", "butter", "mint", "peach"];

export const ALLERGENS = ["gluten", "dairy", "egg", "nuts", "peanuts", "soy", "sesame"] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const ALLERGEN_LABELS: Record<Allergen, string> = {
	gluten: "Gluten",
	dairy: "Dairy",
	egg: "Egg",
	nuts: "Tree nuts",
	peanuts: "Peanuts",
	soy: "Soy",
	sesame: "Sesame",
};

/** Statuses a customer sees as forward progress, in order. */
export const ORDER_TIMELINE: readonly OrderStatus[] = ["new", "confirmed", "ready", "collected"];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
	new: "Received",
	confirmed: "Confirmed",
	ready: "Ready",
	collected: "Collected",
	cancelled: "Cancelled",
};

/** A bundle price, e.g. `{ qty: 4, priceCents: 1200 }` for "4 for $12". */
export interface PriceTier {
	qty: number;
	priceCents: number;
}

export interface Category {
	id: string;
	name: string;
	slug: string;
	accent: Accent;
	sortOrder: number;
}

export interface Product {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	categoryId: string | null;
	unitPriceCents: number;
	/** "each", "slice", "box of 6". */
	unitLabel: string;
	/** Sold only in multiples of this. Cookies at "2 for $5" have step 2. */
	qtyStep: number;
	maxPerOrder: number | null;
	tiers: PriceTier[];
	/** Object path inside the product-images bucket, not a URL. */
	imagePath: string | null;
	imageAlt: string | null;
	isAvailable: boolean;
	isFeatured: boolean;
	availabilityNote: string | null;
	allergens: Allergen[];
	sortOrder: number;
}

/** A category with its products already attached, for the shop page. */
export interface CategoryWithProducts extends Category {
	products: Product[];
}

export interface SiteSettings {
	businessName: string;
	tagline: string;
	aboutText: string | null;
	pickupSuburb: string | null;
	pickupInstructions: string | null;
	pickupWindowText: string | null;
	leadTimeDays: number;
	/** "HH:MM:SS" in the business timezone. */
	cutoffTime: string;
	bookingWindowDays: number;
	/** IANA zone, e.g. "Pacific/Auckland". */
	timezone: string;
	ordersOpen: boolean;
	ordersClosedMessage: string | null;
	deliveryEnabled: boolean;
	deliveryFeeCents: number;
	deliveryAreaText: string | null;
	contactEmail: string | null;
	contactPhone: string | null;
	instagramHandle: string;
}

/** Never sent to the browser except on a confirmed order's own status page. */
export interface PrivateSettings {
	bankAccountName: string | null;
	bankAccountNumber: string | null;
	pickupAddress: string | null;
	notificationEmail: string | null;
}

/** 0 = Sunday, matching both Postgres `extract(dow)` and JavaScript `getDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_NAMES: Record<Weekday, string> = {
	0: "Sunday",
	1: "Monday",
	2: "Tuesday",
	3: "Wednesday",
	4: "Thursday",
	5: "Friday",
	6: "Saturday",
};

export interface AvailabilityRule {
	weekday: Weekday;
	isOpen: boolean;
	capacity: number;
}

export interface AvailabilityOverride {
	/** YYYY-MM-DD. */
	date: string;
	isOpen: boolean;
	/** Null inherits the weekday rule's capacity. */
	capacity: number | null;
	note: string | null;
}

/** A date a customer may actually choose. */
export interface PickableDate {
	/** YYYY-MM-DD. */
	date: string;
	remaining: number;
	note: string | null;
}

export interface AvailabilityWindow {
	ordersOpen: boolean;
	closedMessage: string | null;
	/** YYYY-MM-DD, or null when orders are closed. */
	earliest: string | null;
	latest: string | null;
	dates: PickableDate[];
}

/** How the admin calendar paints a single day. */
export type DayState = "blocked" | "closed" | "open" | "full" | "past";

export interface CalendarDay {
	date: string;
	weekday: Weekday;
	inMonth: boolean;
	state: DayState;
	capacity: number;
	orderCount: number;
	note: string | null;
	hasOverride: boolean;
}

export interface CartLine {
	productId: string;
	qty: number;
}

export interface Cart {
	v: 1;
	lines: CartLine[];
}

/** A cart line resolved against the catalogue, with its price worked out. */
export interface PricedLine {
	product: Product;
	qty: number;
	totalCents: number;
	note: string;
}

export interface OrderItem {
	id: string;
	productId: string | null;
	productName: string;
	unitLabel: string;
	qty: number;
	lineTotalCents: number;
	pricingNote: string | null;
}

export interface Order {
	id: string;
	orderNumber: number;
	reference: string;
	token: string;
	status: OrderStatus;
	fulfilment: Fulfilment;
	/** YYYY-MM-DD. */
	pickupDate: string;
	customerName: string;
	customerEmail: string;
	customerPhone: string;
	deliveryAddress: string | null;
	notes: string | null;
	customRequest: string | null;
	subtotalCents: number;
	deliveryFeeCents: number;
	totalCents: number;
	internalNotes: string | null;
	cancellationReason: string | null;
	createdAt: string;
	confirmedAt: string | null;
	readyAt: string | null;
	collectedAt: string | null;
	cancelledAt: string | null;
	items: OrderItem[];
}

/** An order row without its items, for list views. */
export type OrderSummary = Omit<Order, "items"> & { itemCount: number };

export interface OrderEvent {
	id: number;
	type: "created" | "status_changed" | "email_sent" | "email_failed" | "note";
	data: Record<string, unknown>;
	createdAt: string;
}

/**
 * What every server action returns. Actions never throw at the caller: a form
 * that fails should re-render with a message, not a crash page.
 */
export type ActionResult<T = undefined> =
	{ ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function actionOk(): ActionResult<undefined>;
export function actionOk<T>(data: T): ActionResult<T>;
export function actionOk<T>(data?: T): ActionResult<T | undefined> {
	return { ok: true, data };
}

export function actionError<T = undefined>(
	error: string,
	fieldErrors?: Record<string, string>,
): ActionResult<T> {
	return { ok: false, error, fieldErrors };
}
