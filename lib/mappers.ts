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
	type Faq,
	type Order,
	type OrderEvent,
	type OrderItem,
	type PriceTier,
	type PrivateSettings,
	type Product,
	type ProductVariant,
	type SiteSettings,
	type Weekday,
} from "./types";

type Tables = Database["public"]["Tables"];
type CategoryRow = Tables["categories"]["Row"];
type FaqRow = Tables["faqs"]["Row"];
type ProductRow = Tables["products"]["Row"];
type TierRow = Tables["product_price_tiers"]["Row"];
type VariantRow = Tables["product_variants"]["Row"];
type SettingsRow = Tables["site_settings"]["Row"];
type PrivateRow = Tables["site_settings_private"]["Row"];
type RuleRow = Tables["availability_rules"]["Row"];
type OverrideRow = Tables["availability_overrides"]["Row"];
type OrderRow = Tables["orders"]["Row"];
type OrderItemRow = Tables["order_items"]["Row"];
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

function toPriceTier(row: Pick<TierRow, "qty" | "price_cents">): PriceTier {
	return { qty: row.qty, priceCents: row.price_cents };
}

type VariantColumns = Pick<
	VariantRow,
	"id" | "name" | "unit_price_cents" | "image_path" | "allergens" | "is_available" | "sort_order"
>;

function toProductVariant(row: VariantColumns): ProductVariant {
	return {
		id: row.id,
		name: row.name,
		unitPriceCents: row.unit_price_cents,
		imagePath: row.image_path,
		allergens: toAllergens(row.allergens),
		isAvailable: row.is_available,
		sortOrder: row.sort_order,
	};
}

export function toProduct(
	row: ProductRow & {
		product_price_tiers?: Array<Pick<TierRow, "qty" | "price_cents">> | null;
		product_variants?: VariantColumns[] | null;
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
		tiers: (row.product_price_tiers ?? []).map(toPriceTier).sort((a, b) => a.qty - b.qty),
		variantLabel: row.variant_label,
		variants: (row.product_variants ?? [])
			.map(toProductVariant)
			// Embedded rows arrive in whatever order PostgREST felt like. The owner
			// put these in an order and the page has to keep it.
			.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
		imagePath: row.image_path,
		imageAlt: row.image_alt,
		isAvailable: row.is_available,
		isFeatured: row.is_featured,
		availabilityNote: row.availability_note,
		allergens: toAllergens(row.allergens),
		sortOrder: row.sort_order,
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

function toOrderItem(row: OrderItemRow): OrderItem {
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
	};
}

export function toOrder(row: OrderRow & { order_items?: OrderItemRow[] | null }): Order {
	return {
		id: row.id,
		orderNumber: row.order_number,
		reference: row.reference,
		token: row.token,
		status: row.status,
		fulfilment: row.fulfilment,
		pickupDate: row.pickup_date,
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
