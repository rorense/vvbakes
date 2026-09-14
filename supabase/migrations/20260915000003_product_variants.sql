-- ---------------------------------------------------------------------------
-- Variants: one product, several versions of it, each with its own price.
--
-- A cake is not one thing. It is chocolate, or carrot, or red velvet, and those
-- are not the same price. Until now the only way to say that was five products
-- called "Chocolate cake", "Carrot cake" and so on, which scattered one thing
-- across five cards in the shop, five slugs, five photos to keep in step, and
-- five rows to reorder every time she added a flavour.
--
-- A variant is a named choice with a price of its own. The product owns the
-- photo, the description, the allergens, the step size and the per-order
-- maximum; the variant owns the name and the price. What the choice is *called*
-- lives on the product, so a cake asks for a flavour and a cake tin asks for a
-- size.
--
-- Whether a product has variants is decided by whether any rows exist for it,
-- not by a flag. There is no state where a product claims to have flavours and
-- has none.
--
-- Bundle prices keep working and keep their meaning: a tier is a price for N of
-- one line, and a line is one flavour, so "4 for $12" is four of the same
-- flavour. Mixing flavours inside a bundle is a different promise and this does
-- not make it.
-- ---------------------------------------------------------------------------

-- What the choice is called on the product page: "Flavour", "Size", "Filling".
-- Only ever read when the product actually has variants.
alter table products
	add column variant_label text not null default 'Flavour'
		check (length(btrim(variant_label)) between 1 and 30);

comment on column products.variant_label is
	'What this product calls its variants, e.g. Flavour. Unused without them.';

create table product_variants (
	id uuid primary key default gen_random_uuid(),
	product_id uuid not null references products (id) on delete cascade,
	name text not null check (length(btrim(name)) between 1 and 60),
	unit_price_cents int not null check (unit_price_cents >= 0),
	-- One flavour can sell out without taking the rest of the product with it.
	is_available boolean not null default true,
	sort_order int not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- Two flavours with the same name would be indistinguishable on the page and
	-- in the order that came from it.
	unique (product_id, name)
);

create index product_variants_product_sort_idx on product_variants (product_id, sort_order);

create trigger product_variants_set_updated_at before update on product_variants
	for each row execute function set_updated_at();

-- Line items snapshot the variant the same way they already snapshot the
-- product: renaming a flavour, repricing it or deleting it must not rewrite
-- what an order said when it was placed. The foreign key is only a pointer back
-- to the live row, and is allowed to go null.
alter table order_items
	add column product_variant_id uuid references product_variants (id) on delete set null,
	add column variant_name text check (variant_name is null or length(variant_name) <= 60);

comment on column order_items.variant_name is
	'The flavour as it was named when the order was placed. Null for a product with no variants.';

alter table product_variants enable row level security;

create policy "public read" on product_variants for select using (true);
create policy "admin all" on product_variants for all to authenticated
	using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- price_for_qty, now able to price a single variant.
--
-- The arity changes, so the old function is dropped rather than replaced:
-- adding a defaulted third parameter alongside it would leave two candidates
-- for every existing two-argument call and Postgres would refuse the call as
-- ambiguous. The default means those callers do not have to change.
--
-- The only difference in the body is which unit price the dynamic program
-- starts from. Bundle tiers belong to the product and apply unchanged, so a
-- flavour priced above the product's own unit price gets a proportionally
-- better deal out of a bundle. That is the owner's list; the admin's price
-- preview shows her what each flavour actually costs before she saves.
-- ---------------------------------------------------------------------------
drop function price_for_qty(uuid, int);

create function price_for_qty(p_product_id uuid, p_qty int, p_variant_id uuid default null)
returns table (total_cents int, note text)
language plpgsql
stable
set search_path = public
as $fn$
declare
	p products%rowtype;
	-- The product's own price, or the chosen variant's in its place.
	v_unit_price int;
	-- best[i + 1] is the cheapest total for i units.
	best bigint[];
	-- pick[i + 1] is the bundle size used to reach i units, or 0 for a single unit.
	pick int[];
	chosen int[] := '{}';
	i int;
	v_tier record;
	candidate bigint;
	v_note text;
begin
	if p_qty < 1 then
		raise exception 'QTY_INVALID';
	end if;

	select * into p from products where id = p_product_id;
	if not found then
		raise exception 'PRODUCT_NOT_FOUND';
	end if;

	v_unit_price := p.unit_price_cents;

	if p_variant_id is not null then
		select v.unit_price_cents into v_unit_price
		from product_variants v
		where v.id = p_variant_id and v.product_id = p_product_id;
		if not found then
			raise exception 'VARIANT_NOT_FOUND';
		end if;
	end if;

	best := array_fill(0::bigint, array[p_qty + 1]);
	pick := array_fill(0, array[p_qty + 1]);

	for i in 1..p_qty loop
		-- Baseline: one more single unit on top of the best price for i - 1.
		best[i + 1] := best[i] + v_unit_price;
		pick[i + 1] := 0;

		for v_tier in
			select qty, price_cents
			from product_price_tiers
			where product_id = p_product_id and qty <= i
		loop
			candidate := best[i - v_tier.qty + 1] + v_tier.price_cents;
			-- On a tie, prefer the larger bundle. "4 for $12" on a $3 item saves
			-- nothing, but the customer chose it off the menu and expects to see
			-- it named on their order, not silently rewritten as four singles.
			if candidate < best[i + 1]
				or (candidate = best[i + 1] and v_tier.qty > pick[i + 1])
			then
				best[i + 1] := candidate;
				pick[i + 1] := v_tier.qty;
			end if;
		end loop;
	end loop;

	-- Walk the choices back to find which bundles were actually used.
	i := p_qty;
	while i > 0 loop
		chosen := chosen || pick[i + 1];
		if pick[i + 1] = 0 then
			i := i - 1;
		else
			i := i - pick[i + 1];
		end if;
	end loop;

	select string_agg(part, ' + ' order by sort_key desc)
	into v_note
	from (
		select
			case
				when u.c = 0 then format(
					'%s x $%s %s',
					count(*),
					to_char(v_unit_price / 100.0, 'FM999990.00'),
					p.unit_label
				)
				else format(
					'%s x %s for $%s',
					count(*),
					u.c,
					to_char(max(t.price_cents) / 100.0, 'FM999990.00')
				)
			end as part,
			u.c as sort_key
		from unnest(chosen) as u (c)
		left join product_price_tiers t
			on t.product_id = p_product_id and t.qty = u.c
		group by u.c, v_unit_price, p.unit_label
	) parts;

	return query select best[p_qty + 1]::int, v_note;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- place_order, now reading a variant off each item.
--
-- The signature is unchanged: an item in `p_items` simply gains an optional
-- `variant_id`, so this is a replace rather than a drop, and the grants at the
-- bottom of the inspiration migration survive untouched.
--
-- The items are walked twice on purpose. `max_per_order` is a limit on the
-- product, not on one flavour of it — six cupcakes means six, not six of each —
-- so it has to be counted before the items are split into per-flavour lines.
-- Everything else (the step size, the price, the row that gets written) is a
-- property of one line.
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
	-- three vanilla is six of that product, and a maximum of four has to catch
	-- it however it was split up.
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

		if v_product.max_per_order is not null and v_item.qty > v_product.max_per_order then
			raise exception 'QTY_INVALID';
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
