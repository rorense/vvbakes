/**
 * Types for the public schema.
 *
 * Hand-written to match supabase/migrations. Once the hosted project exists,
 * regenerate instead of editing by hand:
 *
 *   npm run db:types
 *
 * If a query starts complaining about a column that plainly exists, this file is
 * stale, regenerate it rather than widening a type.
 *
 * After regenerating, re-append the compile-time guard at the bottom of this
 * file. It is the only thing that catches the schema silently degrading to
 * untyped; see its comment for why.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type OrderStatusEnum = "new" | "confirmed" | "ready" | "collected" | "cancelled";
export type FulfilmentEnum = "pickup" | "delivery";

type CategoryRow = {
	id: string;
	name: string;
	slug: string;
	accent: string;
	sort_order: number;
	created_at: string;
	updated_at: string;
};

type ProductRow = {
	id: string;
	category_id: string | null;
	name: string;
	slug: string;
	description: string | null;
	unit_price_cents: number;
	unit_label: string;
	qty_step: number;
	max_per_order: number | null;
	image_path: string | null;
	image_alt: string | null;
	is_available: boolean;
	is_featured: boolean;
	availability_note: string | null;
	allergens: string[];
	sort_order: number;
	created_at: string;
	updated_at: string;
};

type ProductPriceTierRow = {
	id: string;
	product_id: string;
	qty: number;
	price_cents: number;
};

type SiteSettingsRow = {
	id: number;
	business_name: string;
	tagline: string;
	about_text: string | null;
	pickup_suburb: string | null;
	pickup_instructions: string | null;
	pickup_window_text: string | null;
	lead_time_days: number;
	cutoff_time: string;
	booking_window_days: number;
	timezone: string;
	orders_open: boolean;
	orders_closed_message: string | null;
	delivery_enabled: boolean;
	delivery_fee_cents: number;
	delivery_area_text: string | null;
	contact_email: string | null;
	contact_phone: string | null;
	instagram_handle: string;
	updated_at: string;
};

type SiteSettingsPrivateRow = {
	id: number;
	bank_account_name: string | null;
	bank_account_number: string | null;
	pickup_address: string | null;
	notification_email: string | null;
	updated_at: string;
};

type AvailabilityRuleRow = {
	weekday: number;
	is_open: boolean;
	capacity: number;
};

type AvailabilityOverrideRow = {
	date: string;
	is_open: boolean;
	capacity: number | null;
	note: string | null;
	created_at: string;
	updated_at: string;
};

type OrderRow = {
	id: string;
	order_number: number;
	reference: string;
	token: string;
	status: OrderStatusEnum;
	fulfilment: FulfilmentEnum;
	pickup_date: string;
	customer_name: string;
	customer_email: string;
	customer_phone: string;
	delivery_address: string | null;
	notes: string | null;
	custom_request: string | null;
	inspiration_image_paths: string[] | null;
	inspiration_url: string | null;
	subtotal_cents: number;
	delivery_fee_cents: number;
	quote_cents: number;
	total_cents: number;
	internal_notes: string | null;
	cancellation_reason: string | null;
	ip_hash: string | null;
	confirmed_at: string | null;
	ready_at: string | null;
	collected_at: string | null;
	cancelled_at: string | null;
	created_at: string;
	updated_at: string;
};

type OrderItemRow = {
	id: string;
	order_id: string;
	product_id: string | null;
	product_name: string;
	unit_label: string;
	qty: number;
	line_total_cents: number;
	pricing_note: string | null;
};

type OrderEventRow = {
	id: number;
	order_id: string;
	type: string;
	data: Json;
	created_at: string;
};

type AdminRow = {
	user_id: string;
	created_at: string;
};

/** Columns a client may write, with server-defaulted ones optional. */
type Writable<Row, Required extends keyof Row = never> = Partial<Row> & Pick<Row, Required>;

export type Database = {
	__InternalSupabase: {
		PostgrestVersion: "12";
	};
	public: {
		Tables: {
			admins: {
				Row: AdminRow;
				Insert: Writable<AdminRow, "user_id">;
				Update: Partial<AdminRow>;
				Relationships: [];
			};
			categories: {
				Row: CategoryRow;
				Insert: Writable<CategoryRow, "name" | "slug">;
				Update: Partial<CategoryRow>;
				Relationships: [];
			};
			products: {
				Row: ProductRow;
				Insert: Writable<ProductRow, "name" | "slug" | "unit_price_cents">;
				Update: Partial<ProductRow>;
				Relationships: [
					{
						foreignKeyName: "products_category_id_fkey";
						columns: ["category_id"];
						isOneToOne: false;
						referencedRelation: "categories";
						referencedColumns: ["id"];
					},
				];
			};
			product_price_tiers: {
				Row: ProductPriceTierRow;
				Insert: Writable<ProductPriceTierRow, "product_id" | "qty" | "price_cents">;
				Update: Partial<ProductPriceTierRow>;
				Relationships: [
					{
						foreignKeyName: "product_price_tiers_product_id_fkey";
						columns: ["product_id"];
						isOneToOne: false;
						referencedRelation: "products";
						referencedColumns: ["id"];
					},
				];
			};
			site_settings: {
				Row: SiteSettingsRow;
				Insert: Writable<SiteSettingsRow>;
				Update: Partial<SiteSettingsRow>;
				Relationships: [];
			};
			site_settings_private: {
				Row: SiteSettingsPrivateRow;
				Insert: Writable<SiteSettingsPrivateRow>;
				Update: Partial<SiteSettingsPrivateRow>;
				Relationships: [];
			};
			availability_rules: {
				Row: AvailabilityRuleRow;
				Insert: Writable<AvailabilityRuleRow, "weekday">;
				Update: Partial<AvailabilityRuleRow>;
				Relationships: [];
			};
			availability_overrides: {
				Row: AvailabilityOverrideRow;
				Insert: Writable<AvailabilityOverrideRow, "date" | "is_open">;
				Update: Partial<AvailabilityOverrideRow>;
				Relationships: [];
			};
			orders: {
				Row: OrderRow;
				Insert: never; // Orders are only ever created by place_order().
				Update: Partial<OrderRow>;
				Relationships: [];
			};
			order_items: {
				Row: OrderItemRow;
				Insert: never;
				Update: never;
				Relationships: [
					{
						foreignKeyName: "order_items_order_id_fkey";
						columns: ["order_id"];
						isOneToOne: false;
						referencedRelation: "orders";
						referencedColumns: ["id"];
					},
				];
			};
			order_events: {
				Row: OrderEventRow;
				Insert: Writable<OrderEventRow, "order_id" | "type">;
				Update: never;
				Relationships: [
					{
						foreignKeyName: "order_events_order_id_fkey";
						columns: ["order_id"];
						isOneToOne: false;
						referencedRelation: "orders";
						referencedColumns: ["id"];
					},
				];
			};
		};
		Views: Record<string, never>;
		Functions: {
			is_admin: {
				Args: Record<string, never>;
				Returns: boolean;
			};
			price_for_qty: {
				Args: { p_product_id: string; p_qty: number };
				Returns: Array<{ total_cents: number; note: string | null }>;
			};
			order_counts_between: {
				Args: { p_from: string; p_to: string };
				Returns: Array<{ pickup_date: string; order_count: number }>;
			};
			reorder_products: {
				Args: { p_ids: string[] };
				Returns: undefined;
			};
			reorder_categories: {
				Args: { p_ids: string[] };
				Returns: undefined;
			};
			place_order: {
				Args: {
					p_items: Json;
					p_pickup_date: string;
					p_fulfilment: FulfilmentEnum;
					p_customer_name: string;
					p_customer_email: string;
					p_customer_phone: string;
					p_delivery_address: string | null;
					p_notes: string | null;
					p_custom_request: string | null;
					p_ip_hash: string | null;
					p_inspiration_image_paths?: string[];
					p_inspiration_url?: string | null;
				};
				Returns: Array<{
					id: string;
					token: string;
					reference: string;
					total_cents: number;
				}>;
			};
		};
		Enums: {
			order_status: OrderStatusEnum;
			fulfilment_type: FulfilmentEnum;
		};
		CompositeTypes: Record<string, never>;
	};
};

/* ---------------------------------------------------------------------------
 * Compile-time guard.
 *
 * postgrest-js only applies its typing when the schema satisfies GenericSchema.
 * When it does not, the client silently degrades: every query still compiles,
 * `.rpc()` arguments become `undefined`, and column typos stop being caught.
 *
 * The subtle way to break this is to declare a row with `interface` instead of
 * `type`. TypeScript gives type aliases an implicit index signature but not
 * interfaces, so `Row: Record<string, unknown>` fails and the whole schema is
 * discarded without an error anywhere.
 *
 * This assertion turns that silent failure into a build failure.
 * ------------------------------------------------------------------------- */
type AssertPublicSchemaIsUsable<T extends GenericSchemaShape> = T;

type GenericRelationshipShape = {
	foreignKeyName: string;
	columns: string[];
	isOneToOne?: boolean;
	referencedRelation: string;
	referencedColumns: string[];
};

type GenericSchemaShape = {
	Tables: Record<
		string,
		{
			Row: Record<string, unknown>;
			Insert: Record<string, unknown>;
			Update: Record<string, unknown>;
			Relationships: GenericRelationshipShape[];
		}
	>;
	Views: Record<
		string,
		{ Row: Record<string, unknown>; Relationships: GenericRelationshipShape[] }
	>;
	Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
};

export type _SchemaIsUsable = AssertPublicSchemaIsUsable<Database["public"]>;
