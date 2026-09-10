-- ---------------------------------------------------------------------------
-- Core schema for the vvbakes ordering site.
--
-- Money is stored in whole cents as integers. Never floats.
-- Dates a customer picks are plain `date` values in the business timezone
-- (site_settings.timezone); everything else is timestamptz.
-- ---------------------------------------------------------------------------

create type order_status as enum ('new', 'confirmed', 'ready', 'collected', 'cancelled');
create type fulfilment_type as enum ('pickup', 'delivery');

-- Membership table for the owner account. Kept separate from auth.users so that
-- "is signed in" and "is the owner" stay different questions.
create table admins (
	user_id uuid primary key references auth.users (id) on delete cascade,
	created_at timestamptz not null default now()
);

create table categories (
	id uuid primary key default gen_random_uuid(),
	name text not null check (length(btrim(name)) between 1 and 60),
	slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	-- Drives the pastel band each category gets in the shop.
	accent text not null default 'rose' check (accent in ('rose', 'blush', 'butter', 'mint', 'peach')),
	sort_order int not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table products (
	id uuid primary key default gen_random_uuid(),
	category_id uuid references categories (id) on delete set null,
	name text not null check (length(btrim(name)) between 1 and 80),
	slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	description text check (description is null or length(description) <= 1000),
	unit_price_cents int not null check (unit_price_cents >= 0),
	-- Free text: 'each', 'slice', 'box of 6'.
	unit_label text not null default 'each' check (length(btrim(unit_label)) between 1 and 30),
	-- Products sold only in multiples. Cookies at "2 for $5" are unit 250, step 2.
	qty_step int not null default 1 check (qty_step between 1 and 100),
	max_per_order int check (max_per_order is null or max_per_order >= 1),
	image_path text,
	image_alt text check (image_alt is null or length(image_alt) <= 200),
	is_available boolean not null default true,
	is_featured boolean not null default false,
	-- Shown on the card when unavailable, e.g. "back in December".
	availability_note text check (availability_note is null or length(availability_note) <= 120),
	allergens text[] not null default '{}',
	sort_order int not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint products_max_per_order_matches_step
		check (max_per_order is null or max_per_order % qty_step = 0)
);

create index products_category_sort_idx on products (category_id, sort_order);
create index products_featured_idx on products (sort_order) where is_featured;

-- Bundle pricing: "4 for $12" is one row with qty 4. The product's unit price
-- covers whatever is left over after filling as many bundles as possible.
create table product_price_tiers (
	id uuid primary key default gen_random_uuid(),
	product_id uuid not null references products (id) on delete cascade,
	qty int not null check (qty between 2 and 1000),
	price_cents int not null check (price_cents >= 0),
	unique (product_id, qty)
);

create index product_price_tiers_product_idx on product_price_tiers (product_id, qty desc);

-- Single-row settings table. Everything here is safe to read publicly.
create table site_settings (
	id smallint primary key default 1 check (id = 1),
	business_name text not null default 'vvbakes',
	tagline text not null default 'inspired desserts',
	about_text text,
	-- Public, deliberately coarse: a suburb, not a street address.
	pickup_suburb text,
	pickup_instructions text,
	pickup_window_text text,
	-- Minimum days between ordering and pickup.
	lead_time_days int not null default 2 check (lead_time_days between 0 and 60),
	-- Orders placed after this local time lose a day of lead time.
	cutoff_time time not null default '20:00',
	-- How far ahead customers may book.
	booking_window_days int not null default 28 check (booking_window_days between 1 and 120),
	timezone text not null default 'Pacific/Auckland',
	orders_open boolean not null default true,
	orders_closed_message text,
	delivery_enabled boolean not null default false,
	delivery_fee_cents int not null default 0 check (delivery_fee_cents >= 0),
	delivery_area_text text,
	contact_email text,
	contact_phone text,
	instagram_handle text not null default 'vv.bakes',
	updated_at timestamptz not null default now()
);

-- Anything a customer should only see once their order is confirmed, plus the
-- owner's own details. No anon policy is ever granted on this table.
create table site_settings_private (
	id smallint primary key default 1 check (id = 1),
	bank_account_name text,
	bank_account_number text,
	-- Full street address. Only ever rendered on a confirmed order.
	pickup_address text,
	-- Where new-order notifications are sent.
	notification_email text,
	updated_at timestamptz not null default now()
);

-- Weekly pattern. Exactly seven rows; 0 = Sunday, which matches both
-- extract(dow) and JavaScript Date#getDay so SQL and TypeScript agree.
create table availability_rules (
	weekday smallint primary key check (weekday between 0 and 6),
	is_open boolean not null default false,
	capacity int not null default 0 check (capacity >= 0)
);

-- Per-date exceptions: a closure, a market day with extra capacity, a holiday.
create table availability_overrides (
	date date primary key,
	is_open boolean not null,
	-- Null inherits the weekday rule's capacity.
	capacity int check (capacity is null or capacity >= 0),
	note text check (note is null or length(note) <= 120),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Human-facing order numbers start well above zero so the first real order does
-- not look like a test.
create sequence order_number_seq start 1001;

create table orders (
	id uuid primary key default gen_random_uuid(),
	order_number int not null unique,
	-- What the customer types into their bank transfer.
	reference text not null unique,
	-- Unguessable key for the public status page. 32 hex characters.
	token text not null unique default encode(gen_random_bytes(16), 'hex'),
	status order_status not null default 'new',
	fulfilment fulfilment_type not null default 'pickup',
	pickup_date date not null,
	customer_name text not null,
	customer_email text not null,
	customer_phone text not null,
	delivery_address text,
	notes text,
	custom_request text,
	subtotal_cents int not null default 0 check (subtotal_cents >= 0),
	delivery_fee_cents int not null default 0 check (delivery_fee_cents >= 0),
	total_cents int not null default 0 check (total_cents >= 0),
	internal_notes text,
	cancellation_reason text,
	-- A salted hash, not an address: enough to rate limit, not to identify.
	ip_hash text,
	confirmed_at timestamptz,
	ready_at timestamptz,
	collected_at timestamptz,
	cancelled_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Capacity counting always excludes cancelled orders, so the index does too.
create index orders_pickup_date_active_idx on orders (pickup_date) where status <> 'cancelled';
create index orders_status_created_idx on orders (status, created_at desc);
create index orders_ip_hash_created_idx on orders (ip_hash, created_at desc);

-- Line items snapshot the product as it was when ordered. Editing or deleting a
-- product later must never rewrite the history of an order.
create table order_items (
	id uuid primary key default gen_random_uuid(),
	order_id uuid not null references orders (id) on delete cascade,
	product_id uuid references products (id) on delete set null,
	product_name text not null,
	unit_label text not null,
	qty int not null check (qty >= 1),
	line_total_cents int not null check (line_total_cents >= 0),
	-- How the price was arrived at, e.g. "1 x 4 for $12.00 + 1 x $3.00 each".
	pricing_note text
);

create index order_items_order_idx on order_items (order_id);

-- Append-only audit trail. Also where email delivery failures surface.
create table order_events (
	id bigint generated always as identity primary key,
	order_id uuid not null references orders (id) on delete cascade,
	type text not null check (type in ('created', 'status_changed', 'email_sent', 'email_failed', 'note')),
	data jsonb not null default '{}',
	created_at timestamptz not null default now()
);

create index order_events_order_idx on order_events (order_id, created_at desc);

create or replace function set_updated_at() returns trigger
language plpgsql as $fn$
begin
	new.updated_at = now();
	return new;
end;
$fn$;

create trigger categories_set_updated_at before update on categories
	for each row execute function set_updated_at();
create trigger products_set_updated_at before update on products
	for each row execute function set_updated_at();
create trigger site_settings_set_updated_at before update on site_settings
	for each row execute function set_updated_at();
create trigger site_settings_private_set_updated_at before update on site_settings_private
	for each row execute function set_updated_at();
create trigger availability_overrides_set_updated_at before update on availability_overrides
	for each row execute function set_updated_at();
create trigger orders_set_updated_at before update on orders
	for each row execute function set_updated_at();
