/**
 * The one place snake_case database rows become camelCase application objects.
 * Nothing above this layer should reference a column name.
 */
import type { Database } from "./supabase/database.types";
import {
	ACCENTS,
	ALLERGENS,
	type Accent,
	type Allergen,
	type AvailabilityOverride,
	type AvailabilityRule,
	type Category,
	type Extra,
	type Faq,
	type Feedback,
	type FeedbackWithOrder,
	type InstagramPost,
	type Order,
	type OrderEvent,
	type OrderItem,
	type OrderItemExtra,
	type PriceGuideRow,
	type PriceTier,
	type PrivateSettings,
	type Review,
	type Product,
	type ProductOption,
	type ProductOptionGroup,
	type ProductVariant,
	type SiteSettings,
	type Weekday,
} from "./types";

type Tables = Database["public"]["Tables"];
type CategoryRow = Tables["categories"]["Row"];
type FaqRow = Tables["faqs"]["Row"];
type ReviewRow = Tables["reviews"]["Row"];
type FeedbackRow = Tables["feedback"]["Row"];
type InstagramPostRow = Tables["instagram_posts"]["Row"];
type ExtraRow = Tables["product_extras"]["Row"];
type ProductRow = Tables["products"]["Row"];
type TierRow = Tables["product_price_tiers"]["Row"];
type GuideRow = Tables["product_price_guide"]["Row"];
type VariantRow = Tables["product_variants"]["Row"];
type OptionGroupRow = Tables["product_option_groups"]["Row"];
type OptionRow = Tables["product_options"]["Row"];
type SettingsRow = Tables["site_settings"]["Row"];
type PrivateRow = Tables["site_settings_private"]["Row"];
type RuleRow = Tables["availability_rules"]["Row"];
type OverrideRow = Tables["availability_overrides"]["Row"];
type OrderRow = Tables["orders"]["Row"];
type OrderItemRow = Tables["order_items"]["Row"];
type OrderItemExtraRow = Tables["order_item_extras"]["Row"];
type OrderEventRow = Tables["order_events"]["Row"];

function toAccent(value: string): Accent {
	return (ACCENTS as readonly string[]).includes(value) ? (value as Accent) : "rose";
}

/** Drops anything the app does not know about rather than trusting the column. */
function toAllergens(values: string[] | null): Allergen[] {
	if (!values) return [];
	return values.filter((value): value is Allergen =>
		(ALLERGENS as readonly string[]).includes(value),
	);
}

export function toCategory(row: CategoryRow): Category {
	return {
		id: row.id,
		name: row.name,
		slug: row.slug,
		accent: toAccent(row.accent),
		sortOrder: row.sort_order,
	};
}

export function toFaq(row: FaqRow): Faq {
	return {
		id: row.id,
		question: row.question,
		answer: row.answer,
		sortOrder: row.sort_order,
	};
}

export function toReview(row: ReviewRow): Review {
	return {
		id: row.id,
		author: row.author,
		body: row.body,
		detail: row.detail,
		sortOrder: row.sort_order,
	};
}

export function toFeedback(row: FeedbackRow): Feedback {
	return {
		id: row.id,
		orderId: row.order_id,
		author: row.author,
		body: row.body,
		consented: row.consented,
		publishedAt: row.published_at,
		createdAt: row.created_at,
	};
}

/**
 * Feedback plus the three things about its order the admin list shows.
 *
 * Narrow on purpose. The list is a page of other people's words about her
 * cakes; it has no business also carrying their phone numbers.
 */
export const FEEDBACK_SELECT = "*, orders (reference, pickup_date, customer_name)";

/** The three columns `FEEDBACK_SELECT` embeds from the order it belongs to. */
type FeedbackOrderColumns = {
	reference: string;
	pickup_date: string;
	customer_name: string;
};

/**
 * Feedback with enough of its order to be recognised in a list.
 *
 * The embed is declared one-to-one in database.types, so it arrives as a single
 * object rather than an array. A null is only possible in the moment between a
 * cascade deleting the order and this row going with it, and is filled in
 * rather than thrown: an admin list is not the place to crash over it.
 */
export function toFeedbackWithOrder(
	row: FeedbackRow & { orders: FeedbackOrderColumns | null },
): FeedbackWithOrder {
	return {
		...toFeedback(row),
		reference: row.orders?.reference ?? "(no order)",
		pickupDate: row.orders?.pickup_date ?? "",
		customerName: row.orders?.customer_name ?? "",
	};
}

export function toInstagramPost(row: InstagramPostRow): InstagramPost {
	return {
		id: row.id,
		permalink: row.permalink,
		caption: row.caption,
		mediaType: row.media_type,
		imagePath: row.image_path,
		postedAt: row.posted_at,
	};
}

/** The columns `PRODUCT_SELECT` asks for; `product_id` is implied by the nesting. */
type ExtraColumns = Omit<ExtraRow, "product_id" | "created_at" | "updated_at">;

function toExtra(row: ExtraColumns): Extra {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		priceCents: row.price_cents,
		maxQty: row.max_qty,
		isAvailable: row.is_available,
		sortOrder: row.sort_order,
	};
}

function toPriceTier(row: Pick<TierRow, "qty" | "price_cents">): PriceTier {
	return { qty: row.qty, priceCents: row.price_cents };
}

type PriceGuideColumns = Pick<GuideRow, "label" | "price_cents" | "is_addition" | "sort_order">;

function toPriceGuideRow(row: PriceGuideColumns): PriceGuideRow {
	return { label: row.label, priceCents: row.price_cents, isAddition: row.is_addition };
}

type VariantColumns = Pick<
	VariantRow,
	"id" | "name" | "unit_price_cents" | "image_path" | "allergens" | "is_available" | "sort_order"
> & {
	product_variant_options?: Array<{ option_id: string }> | null;
};

type OptionColumns = Pick<
	OptionRow,
	"id" | "name" | "image_path" | "allergens" | "is_available" | "sort_order"
>;

type OptionGroupColumns = Pick<OptionGroupRow, "id" | "name" | "sort_order"> & {
	product_options?: OptionColumns[] | null;
};

/**
 * Embedded rows arrive in whatever order PostgREST felt like. The owner put
 * these in an order and every page has to keep it, so each level is sorted on
 * the way through rather than wherever it happens to be rendered.
 */
function bySortOrder<T extends { sortOrder: number; name: string }>(a: T, b: T): number {
	return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

function toProductVariant(row: VariantColumns): ProductVariant {
	return {
		id: row.id,
		name: row.name,
		unitPriceCents: row.unit_price_cents,
		imagePath: row.image_path,
		allergens: toAllergens(row.allergens),
		isAvailable: row.is_available,
		sortOrder: row.sort_order,
		optionIds: (row.product_variant_options ?? []).map((link) => link.option_id),
	};
}

function toProductOption(row: OptionColumns): ProductOption {
	return {
		id: row.id,
		name: row.name,
		imagePath: row.image_path,
		allergens: toAllergens(row.allergens),
		isAvailable: row.is_available,
		sortOrder: row.sort_order,
	};
}

function toProductOptionGroup(row: OptionGroupColumns): ProductOptionGroup {
	return {
		id: row.id,
		name: row.name,
		sortOrder: row.sort_order,
		options: (row.product_options ?? []).map(toProductOption).sort(bySortOrder),
	};
}

/**
 * Everything a product page needs in one round trip, including the option
 * groups it offers and the options each variant is made of.
 *
 * Kept here rather than in the two query modules that use it because the shape
 * and `toProduct` have to agree: a column added to one and forgotten in the
 * other is a field that silently reads as undefined.
 *
 * One string literal on one long line, deliberately. postgrest-js parses this
 * at the type level to work out what a row comes back as, and it can only do
 * that with a literal: build it by joining an array and every query typed off
 * it degrades to `GenericStringError` with no explanation worth reading.
 */
export const PRODUCT_SELECT =
	"*, product_price_tiers (qty, price_cents), product_price_guide (label, price_cents, is_addition, sort_order), product_extras (id, name, description, price_cents, max_qty, is_available, sort_order), product_variants (id, name, unit_price_cents, image_path, allergens, is_available, sort_order, product_variant_options (option_id)), product_option_groups (id, name, sort_order, product_options (id, name, image_path, allergens, is_available, sort_order))";

export function toProduct(
	row: ProductRow & {
		product_price_tiers?: Array<Pick<TierRow, "qty" | "price_cents">> | null;
		product_price_guide?: PriceGuideColumns[] | null;
		product_variants?: VariantColumns[] | null;
		product_option_groups?: OptionGroupColumns[] | null;
		product_extras?: ExtraColumns[] | null;
	},
): Product {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		description: row.description,
		categoryId: row.category_id,
		unitPriceCents: row.unit_price_cents,
		unitLabel: row.unit_label,
		qtyStep: row.qty_step,
		minPerOrder: row.min_per_order,
		// `?? null` rather than taken at face value, for the reason the switches
		// below are defaulted: for the few minutes between the deploy and the
		// migration the row comes back without this column, and `undefined` would
		// walk into `priceForQty` as a rate rather than as "there isn't one".
		extraUnitPriceCents: row.extra_unit_price_cents ?? null,
		tiers: (row.product_price_tiers ?? []).map(toPriceTier).sort((a, b) => a.qty - b.qty),
		// Sorted here because `sort_order` does not survive the mapping. The order
		// she put these in is the order they read in: sizes counting up, add-ons last.
		priceGuide: (row.product_price_guide ?? [])
			.slice()
			.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
			.map(toPriceGuideRow),
		variantLabel: row.variant_label,
		variants: (row.product_variants ?? []).map(toProductVariant).sort(bySortOrder),
		optionGroups: (row.product_option_groups ?? []).map(toProductOptionGroup).sort(bySortOrder),
		extras: (row.product_extras ?? []).map(toExtra).sort(bySortOrder),
		imagePath: row.image_path,
		imageAlt: row.image_alt,
		isAvailable: row.is_available,
		isFeatured: row.is_featured,
		availabilityNote: row.availability_note,
		allergens: toAllergens(row.allergens),
		sortOrder: row.sort_order,
		// Defaulted rather than taken at face value. The app is deployed before
		// the migration is applied, so for a little while these columns are not
		// there and the row comes back without them; `undefined` is falsy and
		// would behave, but `false` is what the type promises.
		priceOnRequest: row.price_on_request ?? false,
		wantsBrief: row.wants_brief ?? false,
		wantsCustomFlavour: row.wants_custom_flavour ?? false,
		// True rather than false when the column is missing, which is the one of
		// these that inverts: the note has been asked for on every product since
		// the shop opened, and the minutes between the deploy and the migration
		// must not be the thing that stops asking for it.
		wantsNote: row.wants_note ?? true,
		noteHint: row.note_hint ?? null,
		notePlaceholder: row.note_placeholder ?? null,
		inspirationHint: row.inspiration_hint ?? null,
		priceGuideNote: row.price_guide_note ?? null,
	};
}

export function toSettings(row: SettingsRow): SiteSettings {
	return {
		businessName: row.business_name,
		tagline: row.tagline,
		aboutText: row.about_text,
		pickupSuburb: row.pickup_suburb,
		pickupInstructions: row.pickup_instructions,
		pickupWindowText: row.pickup_window_text,
		leadTimeDays: row.lead_time_days,
		cutoffTime: row.cutoff_time,
		bookingWindowDays: row.booking_window_days,
		timezone: row.timezone,
		ordersOpen: row.orders_open,
		ordersClosedMessage: row.orders_closed_message,
		deliveryEnabled: row.delivery_enabled,
		deliveryFeeCents: row.delivery_fee_cents,
		deliveryAreaText: row.delivery_area_text,
		contactEmail: row.contact_email,
		contactPhone: row.contact_phone,
		instagramHandle: row.instagram_handle,
	};
}

export function toPrivateSettings(row: PrivateRow): PrivateSettings {
	return {
		bankAccountName: row.bank_account_name,
		bankAccountNumber: row.bank_account_number,
		pickupAddress: row.pickup_address,
		notificationEmail: row.notification_email,
	};
}

export function toRule(row: RuleRow): AvailabilityRule {
	return {
		weekday: row.weekday as Weekday,
		isOpen: row.is_open,
		capacity: row.capacity,
	};
}

export function toOverride(row: OverrideRow): AvailabilityOverride {
	return {
		date: row.date,
		isOpen: row.is_open,
		capacity: row.capacity,
		note: row.note,
	};
}

function toOrderItemExtra(row: OrderItemExtraRow): OrderItemExtra {
	return {
		id: row.id,
		extraId: row.extra_id,
		name: row.name,
		qty: row.qty,
		unitQty: row.unit_qty,
		unitPriceCents: row.unit_price_cents,
		lineTotalCents: row.line_total_cents,
		sortOrder: row.sort_order,
	};
}

type OrderItemColumns = OrderItemRow & {
	order_item_extras?: OrderItemExtraRow[] | null;
};

function toOrderItem(row: OrderItemColumns): OrderItem {
	return {
		id: row.id,
		productId: row.product_id,
		productVariantId: row.product_variant_id,
		productName: row.product_name,
		variantName: row.variant_name,
		unitLabel: row.unit_label,
		qty: row.qty,
		lineTotalCents: row.line_total_cents,
		pricingNote: row.pricing_note,
		// Snapshotted with a sort order of their own so the line reads in the order
		// the owner arranged the list in, rather than however the rows came back.
		extras: (row.order_item_extras ?? []).map(toOrderItemExtra).sort(bySortOrder),
		note: row.note ?? null,
		inspirationUrl: row.inspiration_url ?? null,
		inspirationImagePaths: row.inspiration_image_paths ?? [],
		customFlavour: row.custom_flavour ?? null,
		// Null whenever the box was ticked, because the two are one answer to one
		// question and the column has a constraint saying so. `frostingLabel` is
		// what turns the pair back into a sentence.
		frosting: row.frosting ?? null,
		frostingMatchesFlavour: row.frosting_matches_flavour ?? false,
		// See `toProduct`: absent until the migration lands, and absent forever
		// on the lines of orders placed before it.
		priceOnRequest: row.price_on_request ?? false,
	};
}

/**
 * An order and everything hanging off it, including the extras each line
 * carried.
 *
 * Kept beside `toOrder` for the reason `PRODUCT_SELECT` is kept beside
 * `toProduct`: the four places that read an order have to ask for the same
 * columns, and a nested table added to one of them and forgotten in the others
 * is an array that silently reads as empty.
 */
export const ORDER_SELECT = "*, order_items (*, order_item_extras (*))";

export function toOrder(row: OrderRow & { order_items?: OrderItemColumns[] | null }): Order {
	return {
		id: row.id,
		orderNumber: row.order_number,
		reference: row.reference,
		token: row.token,
		status: row.status,
		fulfilment: row.fulfilment,
		pickupDate: row.pickup_date,
		pickupTime: row.pickup_time,
		customerName: row.customer_name,
		customerEmail: row.customer_email,
		customerPhone: row.customer_phone,
		deliveryAddress: row.delivery_address,
		notes: row.notes,
		customRequest: row.custom_request,
		inspirationImagePaths: row.inspiration_image_paths ?? [],
		inspirationUrl: row.inspiration_url,
		subtotalCents: row.subtotal_cents,
		deliveryFeeCents: row.delivery_fee_cents,
		quoteCents: row.quote_cents,
		totalCents: row.total_cents,
		internalNotes: row.internal_notes,
		cancellationReason: row.cancellation_reason,
		createdAt: row.created_at,
		confirmedAt: row.confirmed_at,
		readyAt: row.ready_at,
		collectedAt: row.collected_at,
		cancelledAt: row.cancelled_at,
		// Read with the same tolerance as `wants_note`: the app is deployed
		// before the migration is applied, and for those few minutes the row
		// comes back without the column. Undefined has to read as "not asked",
		// or the cron would skip every order it cannot see a stamp on.
		feedbackRequestedAt: row.feedback_requested_at ?? null,
		items: (row.order_items ?? [])
			.map(toOrderItem)
			// Flavours of one product sit together, in name order, rather than
			// scattering three lines of the same cake through the list.
			.sort(
				(a, b) =>
					a.productName.localeCompare(b.productName) ||
					(a.variantName ?? "").localeCompare(b.variantName ?? ""),
			),
	};
}

export function toOrderEvent(row: OrderEventRow): OrderEvent {
	return {
		id: row.id,
		type: row.type as OrderEvent["type"],
		data: (row.data ?? {}) as Record<string, unknown>,
		createdAt: row.created_at,
	};
}
