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
	min_per_order: number | null;
	/** What each one past the minimum costs, when that is less. Null charges the one price. */
	extra_unit_price_cents: number | null;
	variant_label: string;
	image_path: string | null;
	image_alt: string | null;
	/** Extra photos shown under the main one, in order. Empty for most products. */
	gallery_image_paths: string[];
	is_available: boolean;
	is_featured: boolean;
	availability_note: string | null;
	allergens: string[];
	sort_order: number;
	/** No price until the owner has seen the brief; she quotes it afterwards. */
	price_on_request: boolean;
	/** The product page asks for inspiration photos and a link, not just a note. */
	wants_brief: boolean;
	/** The product page asks for a flavour of their own, and for what the frosting should be. */
	wants_custom_flavour: boolean;
	/** Every flavour offered at once with a count beside each. Needs exactly one option group. */
	mix_variants: boolean;
	/** The product page asks "Anything to add?" at all. */
	wants_note: boolean;
	/** The line under the note box, in her words. Null uses the wording in BriefFields. */
	note_hint: string | null;
	/** The example inside the empty note box, in her words. Null uses BriefFields. */
	note_placeholder: string | null;
	/** What the brief questions call this, singular. Null says "cake". */
	brief_noun: string | null;
	/** The line under the photo picker, in her words. Null uses InspirationPicker. */
	inspiration_hint: string | null;
	/** The line under the price guide, in her own words. Null hides it. */
	price_guide_note: string | null;
	created_at: string;
	updated_at: string;
};

type ProductPriceTierRow = {
	id: string;
	product_id: string;
	qty: number;
	price_cents: number;
};

type ProductPriceGuideRow = {
	id: string;
	product_id: string;
	label: string;
	price_cents: number;
	/** Rendered as "+ $10" rather than "from $45". */
	is_addition: boolean;
	sort_order: number;
};

type ProductVariantRow = {
	id: string;
	product_id: string;
	name: string;
	unit_price_cents: number;
	image_path: string | null;
	allergens: string[];
	is_available: boolean;
	sort_order: number;
	/** Null counts this combination towards the product's minimum, not its own. */
	min_per_order: number | null;
	created_at: string;
	updated_at: string;
};

type ProductOptionGroupRow = {
	id: string;
	product_id: string;
	name: string;
	sort_order: number;
	created_at: string;
	updated_at: string;
};

type ProductOptionRow = {
	id: string;
	group_id: string;
	name: string;
	image_path: string | null;
	allergens: string[];
	is_available: boolean;
	sort_order: number;
	created_at: string;
	updated_at: string;
};

type ProductVariantOptionRow = {
	variant_id: string;
	group_id: string;
	option_id: string;
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
	delivery_fee_on_request: boolean;
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
	pickup_time: string | null;
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
	/** When the feedback request went out. Null means the cron has not asked yet. */
	feedback_requested_at: string | null;
	created_at: string;
	updated_at: string;
};

type OrderItemRow = {
	id: string;
	order_id: string;
	product_id: string | null;
	product_variant_id: string | null;
	product_name: string;
	variant_name: string | null;
	unit_label: string;
	qty: number;
	line_total_cents: number;
	pricing_note: string | null;
	/** What the customer typed about this line. Offered on every product. */
	note: string | null;
	/** A link they gave for this line. Checked for scheme before it is rendered. */
	inspiration_url: string | null;
	/** Object paths in the order-inspiration bucket, for this line. At most three. */
	inspiration_image_paths: string[];
	/** Snapshotted: this line had no price yet. Zero above means unpriced, not free. */
	price_on_request: boolean;
	/** A flavour they asked for that was not on the menu, in their own words. */
	custom_flavour: string | null;
	/** What they asked the frosting to be. Null when it matches the flavour, or when unsaid. */
	frosting: string | null;
	/** They asked for the frosting to taste of the flavour. Never set alongside `frosting`. */
	frosting_matches_flavour: boolean;
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

type FaqRow = {
	id: string;
	question: string;
	answer: string;
	sort_order: number;
	created_at: string;
	updated_at: string;
};

type ReviewRow = {
	id: string;
	author: string;
	body: string;
	detail: string | null;
	sort_order: number;
	created_at: string;
	updated_at: string;
};

type FeedbackRow = {
	id: string;
	order_id: string;
	author: string;
	body: string;
	consented: boolean;
	published_at: string | null;
	created_at: string;
	updated_at: string;
};

type FeedbackOptOutRow = {
	email: string;
	order_id: string | null;
	source: string;
	created_at: string;
};

type InstagramPostRow = {
	id: string;
	permalink: string;
	caption: string | null;
	media_type: string;
	image_path: string;
	posted_at: string;
	created_at: string;
	updated_at: string;
};

type InstagramSyncRow = {
	id: number;
	access_token: string | null;
	token_expires_at: string | null;
	refreshed_at: string | null;
	synced_at: string | null;
	last_error: string | null;
	updated_at: string;
};

type ExtraRow = {
	id: string;
	product_id: string;
	name: string;
	description: string | null;
	price_cents: number;
	max_qty: number;
	is_available: boolean;
	sort_order: number;
	created_at: string;
	updated_at: string;
};

type OrderItemExtraRow = {
	id: string;
	order_item_id: string;
	extra_id: string | null;
	name: string;
	qty: number;
	unit_qty: number;
	unit_price_cents: number;
	line_total_cents: number;
	sort_order: number;
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
			faqs: {
				Row: FaqRow;
				Insert: Writable<FaqRow, "question" | "answer">;
				Update: Partial<FaqRow>;
				Relationships: [];
			};
			reviews: {
				Row: ReviewRow;
				Insert: Writable<ReviewRow, "author" | "body">;
				Update: Partial<ReviewRow>;
				Relationships: [];
			};
			// Written only by submitFeedback through the service role, the same
			// arrangement as orders: the customer's own words are never readable
			// with the anon key.
			feedback: {
				Row: FeedbackRow;
				Insert: Writable<FeedbackRow, "order_id" | "author" | "body">;
				Update: Partial<FeedbackRow>;
				Relationships: [
					{
						foreignKeyName: "feedback_order_id_fkey";
						columns: ["order_id"];
						isOneToOne: true;
						referencedRelation: "orders";
						referencedColumns: ["id"];
					},
				];
			};
			// Written only by the unsubscribe route through the service role, and
			// never updated: see the migration for why an address is added or
			// removed but never edited.
			feedback_optouts: {
				Row: FeedbackOptOutRow;
				Insert: Writable<FeedbackOptOutRow, "email">;
				Update: never;
				Relationships: [
					{
						foreignKeyName: "feedback_optouts_order_id_fkey";
						columns: ["order_id"];
						isOneToOne: false;
						referencedRelation: "orders";
						referencedColumns: ["id"];
					},
				];
			};
			instagram_posts: {
				Row: InstagramPostRow;
				Insert: Writable<
					InstagramPostRow,
					"id" | "permalink" | "media_type" | "image_path" | "posted_at"
				>;
				Update: Partial<InstagramPostRow>;
				Relationships: [];
			};
			instagram_sync: {
				Row: InstagramSyncRow;
				Insert: Writable<InstagramSyncRow, "id">;
				Update: Partial<InstagramSyncRow>;
				Relationships: [];
			};
			product_extras: {
				Row: ExtraRow;
				Insert: Writable<ExtraRow, "product_id" | "name" | "price_cents">;
				Update: Partial<ExtraRow>;
				Relationships: [
					{
						foreignKeyName: "product_extras_product_id_fkey";
						columns: ["product_id"];
						isOneToOne: false;
						referencedRelation: "products";
						referencedColumns: ["id"];
					},
				];
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
			product_price_guide: {
				Row: ProductPriceGuideRow;
				Insert: Writable<ProductPriceGuideRow, "product_id" | "label" | "price_cents">;
				Update: Partial<ProductPriceGuideRow>;
				Relationships: [
					{
						foreignKeyName: "product_price_guide_product_id_fkey";
						columns: ["product_id"];
						isOneToOne: false;
						referencedRelation: "products";
						referencedColumns: ["id"];
					},
				];
			};
			product_variants: {
				Row: ProductVariantRow;
				Insert: Writable<ProductVariantRow, "product_id" | "name" | "unit_price_cents">;
				Update: Partial<ProductVariantRow>;
				Relationships: [
					{
						foreignKeyName: "product_variants_product_id_fkey";
						columns: ["product_id"];
						isOneToOne: false;
						referencedRelation: "products";
						referencedColumns: ["id"];
					},
				];
			};
			product_option_groups: {
				Row: ProductOptionGroupRow;
				Insert: Writable<ProductOptionGroupRow, "product_id" | "name">;
				Update: Partial<ProductOptionGroupRow>;
				Relationships: [
					{
						foreignKeyName: "product_option_groups_product_id_fkey";
						columns: ["product_id"];
						isOneToOne: false;
						referencedRelation: "products";
						referencedColumns: ["id"];
					},
				];
			};
			product_options: {
				Row: ProductOptionRow;
				Insert: Writable<ProductOptionRow, "group_id" | "name">;
				Update: Partial<ProductOptionRow>;
				Relationships: [
					{
						foreignKeyName: "product_options_group_id_fkey";
						columns: ["group_id"];
						isOneToOne: false;
						referencedRelation: "product_option_groups";
						referencedColumns: ["id"];
					},
				];
			};
			product_variant_options: {
				Row: ProductVariantOptionRow;
				Insert: Writable<ProductVariantOptionRow, "variant_id" | "group_id" | "option_id">;
				Update: Partial<ProductVariantOptionRow>;
				Relationships: [
					{
						foreignKeyName: "product_variant_options_variant_id_fkey";
						columns: ["variant_id"];
						isOneToOne: false;
						referencedRelation: "product_variants";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "product_variant_options_option_id_group_id_fkey";
						columns: ["option_id"];
						isOneToOne: false;
						referencedRelation: "product_options";
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
			// Written only by `place_order`, which runs as security definer, so the
			// client has no business inserting into it — same as `order_items`.
			order_item_extras: {
				Row: OrderItemExtraRow;
				Insert: never;
				Update: never;
				Relationships: [
					{
						foreignKeyName: "order_item_extras_order_item_id_fkey";
						columns: ["order_item_id"];
						isOneToOne: false;
						referencedRelation: "order_items";
						referencedColumns: ["id"];
					},
					{
						foreignKeyName: "order_item_extras_extra_id_fkey";
						columns: ["extra_id"];
						isOneToOne: false;
						referencedRelation: "product_extras";
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
			record_attempt: {
				Args: { p_bucket: string; p_key: string | null; p_limit: number; p_window: string };
				Returns: boolean;
			};
			clear_attempts: {
				Args: { p_bucket: string; p_key: string | null };
				Returns: undefined;
			};
			sweep_rate_limits: {
				Args: Record<string, never>;
				Returns: undefined;
			};
			price_for_qty: {
				Args: { p_product_id: string; p_qty: number; p_variant_id?: string | null };
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
					p_pickup_time?: string | null;
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
