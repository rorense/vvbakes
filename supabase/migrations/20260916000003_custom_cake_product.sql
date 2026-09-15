-- ---------------------------------------------------------------------------
-- The custom cake stops being a special case and becomes a product.
--
-- Until now a custom cake was the *absence* of an order: an order with no line
-- items and a description of what was wanted, asked for on a panel bolted to
-- the bottom of the order form. That worked, but it meant the thing she mostly
-- makes was the one thing with no page, no photo, no flavours and no extras,
-- and the order form had to carry a second personality for it.
--
-- So it becomes a row in `products` like everything else. It is browsed to, it
-- is customised on its own page, and it goes in the basket. Two new columns are
-- what let an ordinary product behave like a custom one:
--
--   price_on_request   there is no price until she has seen the brief
--   wants_brief        the page asks for photos and a link, not just a note
--
-- Deliberately two switches rather than one. They travel together on a custom
-- cake, but not everywhere: personalised cookies are made to a brief and still
-- have a price, and a dessert table is priced on request without anybody
-- sending a picture. One column doing both jobs would force the owner to choose
-- which half she meant.
--
-- The brief itself moves from the order to the line. That is the real change
-- here: a basket holding two custom cakes for two parties is two briefs, and
-- there was nowhere to put the second one. `order_items` grows a note, a link
-- and its own photos, and `place_order` stops folding lines together when their
-- briefs differ.
--
-- The order-level `custom_request`, `inspiration_url` and `inspiration_image_paths`
-- columns stay exactly where they are. Orders already placed are described by
-- them, and every page that renders an order goes on reading both. Nothing new
-- writes them.
-- ---------------------------------------------------------------------------

-- --- products ---------------------------------------------------------------

alter table products
	add column price_on_request boolean not null default false,
	add column wants_brief boolean not null default false;

comment on column products.price_on_request is
	'No price until the owner has seen the brief. The line totals zero and she quotes it afterwards.';
comment on column products.wants_brief is
	'The product page asks for inspiration photos and a link, not just a note.';

-- --- the brief, per line ----------------------------------------------------
--
-- `note` is offered on every product, because "no sprinkles please" and "write
-- Happy Birthday Sam on it" are things somebody wants to say about a box of
-- cupcakes as much as about a custom cake. The photos and the link are only
-- asked for where `wants_brief` is on.
--
-- The columns are nullable and empty by default, so every order_items row
-- written before today reads as a line with no brief, which is what it was.

alter table order_items
	add column note text check (note is null or length(btrim(note)) between 1 and 1000),
	add column inspiration_url text check (inspiration_url is null or length(inspiration_url) <= 500),
	add column inspiration_image_paths text[] not null default '{}'
		check (array_length(inspiration_image_paths, 1) is null
			or array_length(inspiration_image_paths, 1) <= 3),
	-- Snapshotted from the product, exactly as the name and the unit label
	-- already are. Without it, "this line has no price yet" and "this line is
	-- free" are both a zero, and the difference between them is the difference
	-- between an invoice to send and an invoice already settled. Un-ticking
	-- `price_on_request` on the product later must not rewrite an order that
	-- went out saying the price was still to come.
	add column price_on_request boolean not null default false;

comment on column order_items.note is
	'What the customer typed about this line. Offered on every product.';
comment on column order_items.price_on_request is
	'This line had no price when the order was placed. Zero here means unpriced, not free.';
comment on column order_items.inspiration_url is
	'A link the customer gave for this line. Checked for scheme before it is ever rendered.';
comment on column order_items.inspiration_image_paths is
	'Object paths in the order-inspiration bucket, for this line. At most three.';

-- ---------------------------------------------------------------------------
-- place_order, now carrying a brief on each line.
--
-- The signature is unchanged again, for the reason the extras migration gives:
-- the new fields arrive inside the items array that was already being passed,
-- so every grant survives and no caller that does not use them has to change.
--
-- Four things are different:
--
--   1. The second pass groups by the brief as well as by the flavour and the
--      extras. Two custom cakes with two briefs are two lines; a basket that
--      genuinely holds the same thing twice still comes out as one. GROUP BY
--      treats two nulls as equal, which is what keeps every line with no brief
--      folding together exactly as it did before.
--
--   2. A product with `price_on_request` prices at zero and says so in its
--      note, rather than quoting the placeholder in `unit_price_cents`. Bundle
--      tiers are not consulted: there is no price to bundle.
--
--   3. An order made entirely of price-on-request lines is a real order with a
--      zero total, which is the state `quote_cents` was built for. The owner
--      prices it in the admin and the customer is emailed, exactly as a custom
--      request used to work.
--
--   4. The "an order has to be something" check now counts line items only,
--      because an order with no lines has nothing to attach a brief to.
--      An order-level request is still accepted, so a caller that predates this
--      migration goes on working.
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

	-- An order has to be *something*. Since the custom cake became a product
	-- that is nearly always "something off the menu", but an order-level request
	-- is still accepted so that a caller written before this migration, and the
	-- orders already in the table, go on meaning what they meant.
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
	-- that six however it was split up. Neither extras nor briefs change
	-- anything here: a minimum counts cakes.
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

	-- Second pass: one line per flavour, set of extras and brief. Quantities are
	-- summed within a line, so a basket listing the same thing twice does not
	-- become two rows. Grouping treats two nulls as equal, which is what keeps a
	-- product with no variants and no brief coming out as the single line it has
	-- always been. The extras are reduced to a sorted, de-duplicated array first
	-- so that the same two extras picked in the other order are recognised as
	-- the same line; the photo paths are deliberately *not* sorted, because the
	-- order a customer arranged their references in is part of the brief.
	for v_item in
		select
			(value ->> 'product_id')::uuid as product_id,
			nullif(value ->> 'variant_id', '')::uuid as variant_id,
			chosen.ids as extra_ids,
			nullif(regexp_replace(coalesce(value ->> 'note', ''), '^\s+|\s+$', '', 'g'), '') as note,
			nullif(regexp_replace(coalesce(value ->> 'inspiration_url', ''), '^\s+|\s+$', '', 'g'), '')
				as inspiration_url,
			brief.paths as image_paths,
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
		cross join lateral (
			select coalesce(array_agg(kept.path order by kept.pos), '{}') as paths
			from (
				select p.path, p.pos
				from jsonb_array_elements_text(
					case
						when jsonb_typeof(value -> 'inspiration_image_paths') = 'array'
							then value -> 'inspiration_image_paths'
						else '[]'::jsonb
					end
				) with ordinality as p(path, pos)
				where p.path ~ '[^[:space:]]'
				order by p.pos
				limit 3
			) kept
		) brief
		group by 1, 2, 3, 4, 5, 6
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
		--
		-- Priced even on a line whose cake is not: candles cost what candles cost
		-- whether or not the cake under them has been quoted yet.
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

		if v_product.price_on_request then
			-- Nothing to price and nothing to bundle. The line is real, it is on
			-- the order and it is what the owner quotes against; it simply has no
			-- number yet, and saying so is more honest than quoting the
			-- placeholder sitting in unit_price_cents.
			v_line := 0;
			v_line_note := 'Price to follow';
		else
			select f.total_cents, f.note into v_line, v_line_note
			from price_for_qty(v_product.id, v_item.qty, v_item.variant_id) f;
		end if;

		insert into order_items (
			order_id, product_id, product_variant_id, product_name, variant_name,
			unit_label, qty, line_total_cents, pricing_note,
			note, inspiration_url, inspiration_image_paths, price_on_request
		)
		values (
			v_order_id, v_product.id, v_item.variant_id, v_product.name, v_variant.name,
			v_product.unit_label, v_item.qty, v_line, v_line_note,
			v_item.note, v_item.inspiration_url, v_item.image_paths, v_product.price_on_request
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
	-- whatever came off the menu, extras included. An order made only of
	-- price-on-request lines totals zero here, which is exactly what the status
	-- page and the admin already read as "not priced yet".
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
			-- Still "is there custom work on this order", now asked of the lines
			-- rather than of their absence. Read off the lines' own snapshot, so
			-- the answer cannot change later when a product is edited.
			'custom', v_item_count = 0 or exists (
				select 1 from order_items oi
				where oi.order_id = v_order_id and oi.price_on_request
			),
			'photos', coalesce(array_length(v_paths, 1), 0) + coalesce((
				select sum(coalesce(array_length(oi.inspiration_image_paths, 1), 0))::int
				from order_items oi
				where oi.order_id = v_order_id
			), 0)
		)
	);

	return query select v_order_id, v_token, v_reference, (v_subtotal + v_fee);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- The custom cake itself.
--
-- Seeded rather than left for the owner to create, because the whole point of
-- this change is that a customer can browse to it — a column nobody has ticked
-- is a feature that is switched off. Sizes are the questions it asks; they are
-- the thing she needs to know before she can price anything, and they cost
-- nothing to answer wrongly because the price comes later regardless.
--
-- `on conflict (slug) do nothing`, so re-running this never overwrites whatever
-- she has since made of it.
-- ---------------------------------------------------------------------------
insert into products (
	name, slug, category_id, description,
	unit_price_cents, unit_label, qty_step, is_featured, sort_order,
	price_on_request, wants_brief, variant_label
) values (
	'Custom cake', 'custom-cake',
	(select id from categories where slug = 'cakes-and-kue'),
	'Tell me what you are after and I will come back to you with a price. The occasion, roughly how many people, flavours and colours — and a picture, if you have one.',
	0, 'cake', 1, true, 0,
	true, true, 'Size'
)
on conflict (slug) do nothing;

insert into product_variants (product_id, name, unit_price_cents, sort_order)
select p.id, v.name, 0, v.sort_order
from products p
cross join (values
	('Six to eight people', 1),
	('Ten to twelve people', 2),
	('Fifteen to twenty people', 3),
	('Two tiers', 4),
	('Not sure yet', 5)
) as v(name, sort_order)
where p.slug = 'custom-cake'
on conflict (product_id, name) do nothing;
