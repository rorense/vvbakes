-- ---------------------------------------------------------------------------
-- Variants made of more than one choice: flavour *and* layers.
--
-- A variant is still exactly what it was — one thing a customer can buy, with
-- one price, one photo, one availability switch and one row an order can point
-- at. What changes is how it is *described*. Until now a variant was a bare
-- name off a single list, so "Flavour" was the only question a product could
-- ask. A cake that comes in three flavours and one, two or three layers has two
-- questions, and the only way to say that was nine names in one list with both
-- questions mashed into each of them.
--
-- So the questions move into tables of their own and the variant becomes the
-- answer to all of them at once:
--
--   product_option_groups    the questions: "Flavour", "Layers"
--   product_options          the answers to one question: Chocolate, Carrot
--   product_variant_options  which answers this variant is made of
--
-- The price stays on the variant, which is what "full matrix" means: every
-- combination is priced outright rather than derived from a base plus a
-- surcharge per layer. Three flavours and three layer counts is nine rows and
-- nine prices, and the owner types all nine, because that is the only model in
-- which "Chocolate, 3 layers" costs whatever she decides it costs.
--
-- WHAT THIS DOES NOT DO, ON PURPOSE: it does not touch a single existing row.
--
-- A product whose variants have no options is not broken and is not legacy
-- debt. It is a product with one question, and that question is already written
-- on `products.variant_label`. The application reads it as a single implied
-- group (see `optionGroups` in lib/pricing.ts), so the picker, the admin form
-- and the order path each have one shape to handle rather than two. Nothing is
-- backfilled, nothing is dropped, and a shop that never wants a second question
-- never grows a row in any of these tables.
--
-- Bundle tiers are unchanged and keep their meaning: a tier is a price for N of
-- one line, and a line is one whole combination, so "2 for $80" is two of the
-- same flavour at the same number of layers.
-- ---------------------------------------------------------------------------

-- What this product asks: "Flavour", "Size", "Layers".
create table product_option_groups (
	id uuid primary key default gen_random_uuid(),
	product_id uuid not null references products (id) on delete cascade,
	name text not null check (length(btrim(name)) between 1 and 30),
	sort_order int not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- Two questions with the same name would be two pickers under one legend.
	unique (product_id, name)
);

comment on table product_option_groups is
	'One question a product asks before it can be ordered, e.g. Flavour.';

create index product_option_groups_product_sort_idx
	on product_option_groups (product_id, sort_order);

create trigger product_option_groups_set_updated_at before update on product_option_groups
	for each row execute function set_updated_at();

-- One answer to one question.
--
-- The photo and the allergens live here rather than on the variant because they
-- belong to the answer, not to the combination: the walnuts are in the carrot
-- cake whether it is one layer or three, and asking for the same photo on every
-- row of a nine-row matrix is how a picture of a lemon cake ends up filed under
-- chocolate.
create table product_options (
	id uuid primary key default gen_random_uuid(),
	group_id uuid not null references product_option_groups (id) on delete cascade,
	name text not null check (length(btrim(name)) between 1 and 60),
	-- Object path inside the product-images bucket, same as products.image_path.
	image_path text check (image_path is null or length(image_path) between 1 and 400),
	allergens text[] not null default '{}',
	-- Switching one answer off takes every combination made of it with it, so
	-- "Carrot sold out" is one click rather than three.
	is_available boolean not null default true,
	sort_order int not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (group_id, name),
	-- Redundant on its own, and the target of the link table's composite foreign
	-- key below: it is what lets the database insist that an option filed under a
	-- group really does belong to it.
	unique (id, group_id)
);

comment on column product_options.allergens is
	'What this answer adds to the allergens on the product, never a replacement.';

create index product_options_group_sort_idx on product_options (group_id, sort_order);

create trigger product_options_set_updated_at before update on product_options
	for each row execute function set_updated_at();

-- Which answers one variant is made of: one row per question.
--
-- `group_id` is carried here rather than read through the option, so the primary
-- key can say the thing that actually matters — a variant answers each question
-- exactly once. Without it a variant could be built from two flavours and no
-- layer count, and the picker would have nothing sensible to do with it. The
-- composite foreign key is what keeps the denormalised group honest.
create table product_variant_options (
	variant_id uuid not null references product_variants (id) on delete cascade,
	group_id uuid not null references product_option_groups (id) on delete cascade,
	option_id uuid not null,
	primary key (variant_id, group_id),
	foreign key (option_id, group_id)
		references product_options (id, group_id) on delete cascade
);

comment on table product_variant_options is
	'The answers one variant is made of. Empty for a product that asks one question.';

-- Deleting an option has to find the links pointing at it without scanning
-- every variant in the shop.
create index product_variant_options_option_idx on product_variant_options (option_id);

alter table product_option_groups enable row level security;
alter table product_options enable row level security;
alter table product_variant_options enable row level security;

create policy "public read" on product_option_groups for select using (true);
create policy "admin all" on product_option_groups for all to authenticated
	using (is_admin()) with check (is_admin());

create policy "public read" on product_options for select using (true);
create policy "admin all" on product_options for all to authenticated
	using (is_admin()) with check (is_admin());

create policy "public read" on product_variant_options for select using (true);
create policy "admin all" on product_variant_options for all to authenticated
	using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Room for a name built out of several answers.
--
-- A variant's name is still one string — it is what an order snapshots, and an
-- order has to be able to say what was bought without joining back to a
-- catalogue that has moved on. But "Carrot & walnut · 3 layers" is longer than
-- "Carrot & walnut", and 60 characters was chosen when a name answered one
-- question. Both ends widen together: the order item's column has to hold
-- whatever the variant's holds, or `place_order` would refuse the order at the
-- last step with a constraint error nobody could read.
-- ---------------------------------------------------------------------------
alter table product_variants
	drop constraint if exists product_variants_name_check;
alter table product_variants
	add constraint product_variants_name_check check (length(btrim(name)) between 1 and 120);

alter table order_items
	drop constraint if exists order_items_variant_name_check;
alter table order_items
	add constraint order_items_variant_name_check
		check (variant_name is null or length(variant_name) <= 120);

comment on column products.variant_label is
	'The question a product with no option groups asks. Ignored once it has them.';

-- ---------------------------------------------------------------------------
-- place_order, refusing a combination whose answer has sold out.
--
-- The signature and everything else are unchanged, so this is a replace rather
-- than a drop and the grants made when this function was first written survive
-- untouched. The one addition is in the second pass: a variant row can still be
-- switched on while the "Carrot" it is made of is switched off, and a basket
-- filled before the owner sold out of carrots has to be refused rather than
-- quietly baked.
--
-- A product with no options is unaffected — the subquery matches nothing — so
-- every existing product takes orders exactly as it did before.
-- ---------------------------------------------------------------------------
create or replace function place_order(
	p_items jsonb,
	p_pickup_date date,
	p_fulfilment fulfilment_type,
	p_customer_name text,
	p_customer_email text,
	p_customer_phone text,
	p_delivery_address text,
	p_notes text,
	p_custom_request text,
	p_ip_hash text,
	p_inspiration_image_paths text[] default '{}',
	p_inspiration_url text default null
)
returns table (id uuid, token text, reference text, total_cents int)
language plpgsql
security definer
set search_path = public
as $fn$
declare
	s site_settings%rowtype;
	v_now_local timestamp;
	v_today date;
	v_earliest date;
	v_open boolean;
	v_capacity int;
	v_used int;
	v_item record;
	v_product products%rowtype;
	v_variant product_variants%rowtype;
	v_variant_count int;
	v_line int;
	v_line_note text;
	v_subtotal int := 0;
	v_fee int := 0;
	v_number int;
	v_order_id uuid;
	v_token text;
	v_reference text;
	v_item_count int := 0;
	v_has_request boolean;
	v_paths text[];
	v_url text;
begin
	select * into s from site_settings where site_settings.id = 1;
	if not found then
		raise exception 'SETTINGS_MISSING';
	end if;

	if not s.orders_open then
		raise exception 'ORDERS_CLOSED';
	end if;

	if p_items is null or jsonb_typeof(p_items) <> 'array' then
		raise exception 'EMPTY_ORDER';
	end if;

	v_item_count := jsonb_array_length(p_items);

	-- Blank entries dropped, then capped. The caller has already uploaded these,
	-- so a fourth path is a bug on the way in rather than something to refuse the
	-- whole order over; the column's own constraint would refuse it outright.
	select coalesce(array_agg(kept.path order by kept.pos), '{}')
	into v_paths
	from (
		select u.path, u.pos
		from unnest(coalesce(p_inspiration_image_paths, '{}')) with ordinality as u(path, pos)
		where u.path ~ '[^[:space:]]'
		order by u.pos
		limit 3
	) kept;

	v_url := nullif(regexp_replace(coalesce(p_inspiration_url, ''), '^\s+|\s+$', '', 'g'), '');

	-- btrim() with no second argument strips spaces and nothing else, so a
	-- request of newlines and tabs would look like real content. Check for an
	-- actual non-whitespace character instead.
	v_has_request := coalesce(p_custom_request, '') ~ '[^[:space:]]'
		or coalesce(array_length(v_paths, 1), 0) > 0
		or v_url is not null;

	-- An order has to be *something*: things off the menu, a description of a
	-- cake to make, or a picture of one, which is a brief in its own right.
	if v_item_count = 0 and not v_has_request then
		raise exception 'EMPTY_ORDER';
	end if;

	-- Coarse spam brake. Three order attempts from one address in a quarter of an
	-- hour is already well past what a real customer does.
	if p_ip_hash is not null and (
		select count(*) from orders o
		where o.ip_hash = p_ip_hash and o.created_at > now() - interval '15 minutes'
	) >= 3 then
		raise exception 'RATE_LIMITED';
	end if;

	-- Lead time and cut-off are evaluated in the business timezone, not the
	-- server's and not the customer's.
	v_now_local := now() at time zone s.timezone;
	v_today := v_now_local::date;
	v_earliest := v_today
		+ s.lead_time_days
		+ case when v_now_local::time > s.cutoff_time then 1 else 0 end;

	if p_pickup_date < v_earliest or p_pickup_date > v_today + s.booking_window_days then
		raise exception 'DATE_NOT_BOOKABLE';
	end if;

	if p_fulfilment = 'delivery' then
		if not s.delivery_enabled then
			raise exception 'DELIVERY_DISABLED';
		end if;
		if coalesce(p_delivery_address, '') !~ '[^[:space:]]' then
			raise exception 'DELIVERY_ADDRESS_REQUIRED';
		end if;
		v_fee := s.delivery_fee_cents;
	end if;

	perform pg_advisory_xact_lock(hashtext('vvbakes:pickup:' || p_pickup_date::text)::bigint);

	select coalesce(ov.is_open, r.is_open), coalesce(ov.capacity, r.capacity)
	into v_open, v_capacity
	from availability_rules r
	left join availability_overrides ov on ov.date = p_pickup_date
	where r.weekday = extract(dow from p_pickup_date)::smallint;

	if not coalesce(v_open, false) then
		raise exception 'DATE_CLOSED';
	end if;

	select count(*)::int into v_used
	from orders o
	where o.pickup_date = p_pickup_date and o.status <> 'cancelled';

	if v_used >= coalesce(v_capacity, 0) then
		raise exception 'DATE_FULL';
	end if;

	v_number := nextval('order_number_seq');
	v_reference := 'VV' || v_number::text;

	insert into orders (
		order_number, reference, fulfilment, pickup_date,
		customer_name, customer_email, customer_phone,
		delivery_address, notes, custom_request,
		inspiration_image_paths, inspiration_url, ip_hash
	)
	values (
		v_number, v_reference, p_fulfilment, p_pickup_date,
		btrim(p_customer_name), lower(btrim(p_customer_email)), btrim(p_customer_phone),
		-- Trimmed against every whitespace class, not just spaces: btrim() with no
		-- second argument leaves newlines and tabs behind, so a field of blank
		-- lines would be stored as content.
		nullif(regexp_replace(coalesce(p_delivery_address, ''), '^\s+|\s+$', '', 'g'), ''),
		nullif(regexp_replace(coalesce(p_notes, ''), '^\s+|\s+$', '', 'g'), ''),
		nullif(regexp_replace(coalesce(p_custom_request, ''), '^\s+|\s+$', '', 'g'), ''),
		v_paths,
		v_url,
		p_ip_hash
	)
	returning orders.id, orders.token into v_order_id, v_token;

	-- First pass: the product as a whole. A basket holding three chocolate and
	-- three vanilla is six of that product, and a minimum of four is met by
	-- that six however it was split up.
	for v_item in
		select
			(value ->> 'product_id')::uuid as product_id,
			sum((value ->> 'qty')::int)::int as qty
		from jsonb_array_elements(p_items)
		group by 1
	loop
		select * into v_product from products where products.id = v_item.product_id;
		if not found or not v_product.is_available then
			raise exception 'PRODUCT_UNAVAILABLE';
		end if;

		if v_product.min_per_order is not null and v_item.qty < v_product.min_per_order then
			raise exception 'QTY_BELOW_MINIMUM';
		end if;
	end loop;

	-- Second pass: one line per flavour. Quantities are summed within a line, so
	-- a basket listing the same flavour twice does not become two rows. Grouping
	-- treats two nulls as equal, which is what keeps a product with no variants
	-- coming out as the single line it has always been.
	for v_item in
		select
			(value ->> 'product_id')::uuid as product_id,
			nullif(value ->> 'variant_id', '')::uuid as variant_id,
			sum((value ->> 'qty')::int)::int as qty
		from jsonb_array_elements(p_items)
		group by 1, 2
	loop
		select * into v_product from products where products.id = v_item.product_id;
		if not found or not v_product.is_available then
			raise exception 'PRODUCT_UNAVAILABLE';
		end if;

		-- Cleared each time round the loop: a record left over from the previous
		-- line would otherwise write the last flavour's name onto a product that
		-- has no flavours of its own.
		v_variant := null;

		select count(*)::int into v_variant_count
		from product_variants pv
		where pv.product_id = v_product.id;

		if v_variant_count > 0 then
			if v_item.variant_id is null then
				raise exception 'VARIANT_REQUIRED';
			end if;

			select * into v_variant
			from product_variants pv
			where pv.id = v_item.variant_id and pv.product_id = v_product.id;

			if not found or not v_variant.is_available then
				raise exception 'VARIANT_UNAVAILABLE';
			end if;

			-- A combination is sold out when any answer it is made of is. Switching
			-- "Carrot" off has to take every carrot line with it, and the basket
			-- that was filled before she switched it off is exactly the caller that
			-- would otherwise slip through: the combination's own row is still on.
			if exists (
				select 1
				from product_variant_options vo
				join product_options o on o.id = vo.option_id
				where vo.variant_id = v_variant.id and not o.is_available
			) then
				raise exception 'VARIANT_UNAVAILABLE';
			end if;

			-- A combination that no longer answers every question is gone rather
			-- than cheap. Deleting an answer takes the link rows with it and leaves
			-- the combination behind half-described, which no selection on the page
			-- can name any more, so it must not be orderable by an older basket
			-- that still knows its id. A product that asks nothing counts nothing
			-- on either side and is unaffected.
			if (
				select count(*) from product_variant_options vo where vo.variant_id = v_variant.id
			) <> (
				select count(*) from product_option_groups g where g.product_id = v_product.id
			) then
				raise exception 'VARIANT_UNAVAILABLE';
			end if;
		elsif v_item.variant_id is not null then
			-- The product has no flavours. The basket was filled before the owner
			-- took them away, and charging the product's own price for a flavour
			-- that no longer exists would be guessing at what was wanted.
			raise exception 'VARIANT_UNAVAILABLE';
		end if;

		if v_item.qty < 1 or v_item.qty % v_product.qty_step <> 0 then
			raise exception 'QTY_INVALID';
		end if;

		select f.total_cents, f.note into v_line, v_line_note
		from price_for_qty(v_product.id, v_item.qty, v_item.variant_id) f;

		insert into order_items (
			order_id, product_id, product_variant_id, product_name, variant_name,
			unit_label, qty, line_total_cents, pricing_note
		)
		values (
			v_order_id, v_product.id, v_item.variant_id, v_product.name, v_variant.name,
			v_product.unit_label, v_item.qty, v_line, v_line_note
		);

		v_subtotal := v_subtotal + v_line;
	end loop;

	-- The quote is zero until the owner sets one, so at this point the total is
	-- whatever came off the menu.
	update orders o
	set subtotal_cents = v_subtotal,
		delivery_fee_cents = v_fee,
		total_cents = v_subtotal + v_fee
	where o.id = v_order_id;

	insert into order_events (order_id, type, data)
	values (
		v_order_id,
		'created',
		jsonb_build_object(
			'reference', v_reference,
			'custom', v_item_count = 0,
			'photos', coalesce(array_length(v_paths, 1), 0)
		)
	);

	return query select v_order_id, v_token, v_reference, (v_subtotal + v_fee);
end;
$fn$;
