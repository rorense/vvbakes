/**
 * Every table and function a working project must have.
 *
 * Split out of scripts/check-setup.mjs so that tests/expected-schema.test.ts can
 * import it without running the check, which reads .env.local and talks to a
 * real project the moment it loads.
 *
 * That test boots the migrations against PGlite and compares them with these
 * two lists, in both directions. It exists because this file is exactly the
 * kind that rots: on 2026-09-16 the table list was five behind within hours of
 * a migration landing, and the check it drives went on reporting "every table
 * is there" against a project missing all five. Add a table to a migration
 * without adding it here and the test now says so.
 */

/**
 * Every table the site reads or writes.
 *
 * Checked through the service key, which bypasses row level security, so an
 * error means the table genuinely is not there rather than that the caller was
 * not allowed to see it.
 */
export const TABLES = [
	"admins",
	"categories",
	"products",
	"product_price_tiers",
	"product_price_guide",
	"product_variants",
	"product_option_groups",
	"product_options",
	"product_variant_options",
	"product_extras",
	"faqs",
	"reviews",
	"feedback",
	"instagram_posts",
	"instagram_sync",
	"site_settings",
	"site_settings_private",
	"availability_rules",
	"availability_overrides",
	"orders",
	"order_items",
	"order_item_extras",
	"order_events",
	"rate_limits",
];

/**
 * The functions, each with arguments that do nothing.
 *
 * An empty id array renumbers no rows, a sweep only removes rate-limit rows
 * that have already expired, clearing a bucket nothing has written to deletes
 * nothing, and an order of no items is refused as EMPTY_ORDER before a single
 * row is written. `price_for_qty` is `stable` and cannot write at all.
 *
 * Only "no such function" is counted as a failure by the caller, so a live
 * function objecting to being handed nothing is a pass.
 */
export const FUNCTIONS = [
	["is_admin", {}],
	["order_counts_between", { p_from: "2020-01-01", p_to: "2020-01-02" }],
	["price_for_qty", { p_product_id: "00000000-0000-0000-0000-000000000000", p_qty: 1 }],
	// Worth probing even though the security section calls it too: that check
	// asserts the *anon* key is refused, and a function that does not exist is
	// refused as well. On its own it reads a missing place_order as a pass.
	[
		"place_order",
		{
			p_items: [],
			p_pickup_date: "2020-01-01",
			p_fulfilment: "pickup",
			p_customer_name: "check",
			p_customer_email: "check@example.com",
			p_customer_phone: "0",
			p_delivery_address: null,
			p_notes: null,
			p_custom_request: null,
			p_ip_hash: null,
		},
	],
	["reorder_products", { p_ids: [] }],
	["reorder_categories", { p_ids: [] }],
	["sweep_rate_limits", {}],
	["clear_attempts", { p_bucket: "setup-probe", p_key: "setup-probe" }],
];

/**
 * Functions the schema has that are deliberately never probed.
 *
 * `record_attempt` is the one that writes, and it ships in the same migration
 * as `clear_attempts` and `sweep_rate_limits` either side of it, so calling it
 * would buy nothing and leave a row behind. `set_updated_at` is a trigger
 * function and is not callable over PostgREST at all.
 *
 * Listed rather than left out so the test can tell "deliberately skipped" from
 * "forgotten", which is the whole failure this file is guarding against.
 */
export const UNPROBED_FUNCTIONS = ["record_attempt", "set_updated_at"];
