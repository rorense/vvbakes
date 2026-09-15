-- ---------------------------------------------------------------------------
-- Extras: the small paid things that go on top of whatever was ordered.
--
-- Candles, a gift box, a handwritten card, a cake topper. They are not variants
-- and not products. A variant is *which* cake; an extra is something that rides
-- along with the cake you already chose, and a customer who wants candles does
-- not want a separate line on the order that says "candles" with no cake
-- attached to it.
--
-- One list for the whole shop, edited in /admin/settings, offered on every
-- product. That is deliberate: the owner asked for extras on all products, and
-- a per-product opt-in would mean re-deciding "does this one get candles" on
-- every product she ever adds. Switching an extra off takes it off every
-- product at once, which is the same shape as the rest of the admin.
--
--   extras              what she sells alongside a cake, and for how much
--   order_item_extras   which of them one line of one order actually carried
--
-- The second table is a snapshot, like `order_items` is. An order has to be
-- able to say what it carried and what that cost long after the price changed
-- or the extra was deleted, so the name and the price are copied in and the
-- foreign key is `on delete set null`. Editing the list never rewrites history.
--
-- WHAT THIS DOES NOT DO: nothing here is seeded. Every other table ships
-- placeholder content so a fresh clone looks like a bakery, but a placeholder
-- extra is a price on a public page that the owner never agreed to charge.
-- Empty is the ordinary state of this list; the product page shows no extras
-- section at all until she types one in, and every existing product goes on
-- taking orders exactly as it did before.
-- ---------------------------------------------------------------------------

create table extras (
	id uuid primary key default gen_random_uuid(),
	-- Unique because the picker on a product page is a list of names, and two
	-- rows called "Candles" at different prices is a coin toss to a customer.
	name text not null unique check (length(btrim(name)) between 1 and 60),
	-- The line under the name: "six, in the colour of your choice".
	description text check (description is null or length(btrim(description)) between 1 and 200),
	-- Per unit of whatever it is added to, not per order. Two cakes with candles
	-- is two sets of candles, which is what someone buying two cakes for two
	-- parties means. Zero is allowed: "a message on the box" can be free and
	-- still be worth asking about.
	price_cents int not null check (price_cents >= 0),
	is_available boolean not null default true,
	sort_order int not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

comment on table extras is
	'Paid add-ons offered on every product, e.g. candles. Priced per unit of the line.';

create index extras_sort_idx on extras (sort_order);

create trigger extras_set_updated_at before update on extras
	for each row execute function set_updated_at();

alter table extras enable row level security;

create policy "public read" on extras for select using (true);
create policy "admin all" on extras for all to authenticated
	using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- What one line of one order carried.
--
-- `qty` is the line's own quantity rather than something the customer set
-- separately: two cakes with candles is two sets. Storing it anyway, alongside
-- the unit price and the total, means the row can be read and rendered without
-- joining back to the line it hangs off — which is what the emails and the
-- status page do — and means a future where the two can differ costs a column
-- rather than a migration of every past order.
--
-- No insert policy and no anon read, exactly like `order_items`: these are
-- written only by `place_order` and read only by the owner or through the
-- service role on the tokenised status page.
-- ---------------------------------------------------------------------------
create table order_item_extras (
	id uuid primary key default gen_random_uuid(),
	order_item_id uuid not null references order_items (id) on delete cascade,
	-- Null once the owner deletes the extra. The name and price below are what
	-- the order actually says; this is only for asking "what is this one now".
	extra_id uuid references extras (id) on delete set null,
	name text not null check (length(btrim(name)) between 1 and 60),
	qty int not null check (qty >= 1),
	unit_price_cents int not null check (unit_price_cents >= 0),
	line_total_cents int not null check (line_total_cents >= 0),
	-- Snapshotted so the order reads in the order she arranged the list in,
	-- rather than in whatever order the rows came back.
	sort_order int not null default 0,
	-- One line carries an extra once or not at all. Two nulls do not conflict in
	-- PostgreSQL, which is the behaviour wanted here: several deleted extras on
	-- one line are several genuine rows, not a clash.
	unique (order_item_id, extra_id)
);

comment on table order_item_extras is
	'The extras one order line carried, snapshotted. Never rewritten by an edit.';

create index order_item_extras_item_idx on order_item_extras (order_item_id);
-- Deleting an extra has to find the rows pointing at it to null them out,
-- without scanning every line of every order ever placed.
create index order_item_extras_extra_idx on order_item_extras (extra_id);

alter table order_item_extras enable row level security;

create policy "admin read" on order_item_extras for select to authenticated using (is_admin());

-- ---------------------------------------------------------------------------
-- place_order, now carrying the extras.
--
-- The signature does not change. The extras arrive inside the items array that
-- was already being passed — one more key on each element — so every grant made
-- when this function was first written survives untouched and no caller that
-- does not use extras has to change at all.
--
-- Three things are different:
--
--   1. The second pass groups by the set of extras as well as by the flavour.
--      A cake with candles and the same cake without are two lines, because
--      they cost different amounts and the customer asked for one of each.
--
--   2. Every extra named is re-checked against the live list, the same way a
--      variant is. A basket filled before she ran out of candles is refused
--      rather than quietly baked without them.
--
--   3. `line_total_cents` on the order item stays exactly what it was: the
--      output of `price_for_qty`, and what `pricing_note` explains. The extras
--      are their own rows with their own totals, so both numbers go on being
--      true and the subtotal is the sum of everything shown.
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
	v_order_item_id uuid;
	v_extra_count int;
	v_extras_unit int;
	v_extras_total int;
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
	-- that six however it was split up. Extras change nothing here: a minimum
	-- counts cakes, not candles.
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

	-- Second pass: one line per flavour and set of extras. Quantities are summed
	-- within a line, so a basket listing the same thing twice does not become two
	-- rows. Grouping treats two nulls as equal, which is what keeps a product
	-- with no variants coming out as the single line it has always been, and the
	-- extras are reduced to a sorted, de-duplicated array first so that the same
	-- two extras picked in the other order are recognised as the same line.
	for v_item in
		select
			(value ->> 'product_id')::uuid as product_id,
			nullif(value ->> 'variant_id', '')::uuid as variant_id,
			chosen.ids as extra_ids,
			sum((value ->> 'qty')::int)::int as qty
		from jsonb_array_elements(p_items)
		cross join lateral (
			select coalesce(array_agg(distinct x::uuid order by x::uuid), '{}'::uuid[]) as ids
			from jsonb_array_elements_text(
				case
					when jsonb_typeof(value -> 'extra_ids') = 'array' then value -> 'extra_ids'
					else '[]'::jsonb
				end
			) as x
		) chosen
		group by 1, 2, 3
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

		-- The extras on this line, priced as the list stands right now.
		--
		-- Counted rather than checked one at a time: an id that names nothing and
		-- an id that names something switched off are the same answer to the
		-- customer, and both have to stop the order rather than quietly dropping
		-- the candles off a birthday cake.
		v_extras_total := 0;

		if coalesce(array_length(v_item.extra_ids, 1), 0) > 0 then
			select count(*)::int, coalesce(sum(e.price_cents), 0)::int
			into v_extra_count, v_extras_unit
			from extras e
			where e.id = any (v_item.extra_ids) and e.is_available;

			if v_extra_count <> array_length(v_item.extra_ids, 1) then
				raise exception 'EXTRA_UNAVAILABLE';
			end if;

			v_extras_total := v_extras_unit * v_item.qty;
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
		)
		returning order_items.id into v_order_item_id;

		-- Snapshotted, name and price and all. A free extra is a real one, so this
		-- is driven by how many were chosen rather than by what they came to.
		if coalesce(array_length(v_item.extra_ids, 1), 0) > 0 then
			insert into order_item_extras (
				order_item_id, extra_id, name, qty, unit_price_cents, line_total_cents, sort_order
			)
			select
				v_order_item_id, e.id, e.name, v_item.qty,
				e.price_cents, e.price_cents * v_item.qty, e.sort_order
			from extras e
			where e.id = any (v_item.extra_ids);
		end if;

		v_subtotal := v_subtotal + v_line + v_extras_total;
	end loop;

	-- The quote is zero until the owner sets one, so at this point the total is
	-- whatever came off the menu, extras included.
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
