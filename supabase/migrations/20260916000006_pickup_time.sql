-- ---------------------------------------------------------------------------
-- The time of day they hope to collect.
--
-- The order form has always asked which day and never what time, so every
-- order arrived meaning "some time in the window", and the answer came back by
-- email one customer at a time. The window itself is already published — it is
-- `pickup_window_text` in the settings, free text like "Pickups 4–7pm" — so
-- this is not a booking system and does not become one. It is one optional
-- question under the calendar: roughly when, so she can space the day out and
-- say yes or suggest another time in the reply she was writing anyway.
--
-- Deliberately not:
--   * required — most people do not mind, and an empty answer is a real one;
--   * capacity — the day's limit still counts orders, not times, and nothing
--     here locks a slot or refuses a second order at half past four;
--   * checked against the window — that window is prose set in the admin and
--     there is nothing here to check against. The form shows it beside the
--     field, and she confirms the time when she confirms the order.
--
-- One column on `orders`, because a time belongs to the whole collection, not
-- to a line of it, and it sits beside `pickup_date` under the same name for
-- the same reason: both mean delivery too, on the orders that are delivered.
-- ---------------------------------------------------------------------------

alter table orders add column pickup_time time;

comment on column orders.pickup_time is
	'Roughly when the customer hopes to collect. A request, not a booking.';

-- ---------------------------------------------------------------------------
-- place_order, taking the time.
--
-- Restated verbatim from 20260916000005_product_extras.sql, which is the newest
-- definition, with one parameter added and one column written. Everything else
-- — the extras lookup, the brief, the custom flavour, price on request — is
-- that migration word for word, because a create is all or nothing and
-- rewriting it from an older copy would silently undo the lot.
--
-- The arity changes, so the old function is dropped rather than replaced: two
-- overloads would both keep their grants, and the wrong one answering is not a
-- failure anyone would notice until an order arrived with its time missing.
-- The new parameter is defaulted, so a caller written against the previous
-- signature — the tests, the race check — still resolves to this one.
-- ---------------------------------------------------------------------------
drop function place_order(
	jsonb, date, fulfilment_type, text, text, text, text, text, text, text, text[], text
);

create function place_order(
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
	p_inspiration_url text default null,
	p_pickup_time time default null
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
	v_pickup_time time;
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

	-- Cut to the minute. The column would keep seconds if a caller sent them,
	-- and a time to the second is a promise nobody made: this is the customer
	-- saying roughly when they expect to turn up.
	v_pickup_time := date_trunc('minute', p_pickup_time::interval)::time;

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
		order_number, reference, fulfilment, pickup_date, pickup_time,
		customer_name, customer_email, customer_phone,
		delivery_address, notes, custom_request,
		inspiration_image_paths, inspiration_url, ip_hash
	)
	values (
		v_number, v_reference, p_fulfilment, p_pickup_date, v_pickup_time,
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
			nullif(regexp_replace(coalesce(value ->> 'custom_flavour', ''), '^\s+|\s+$', '', 'g'), '')
				as custom_flavour,
			frost.matches as frosting_matches_flavour,
			-- The tick wins: one question, one answer. Normalised here rather than
			-- at the insert so the grouping below sees it too, and a browser that
			-- sent both lands on the same line as one that sent only the tick.
			case when frost.matches then null else frost.wanted end as frosting,
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
		cross join lateral (
			select
				-- Compared as jsonb rather than cast to boolean: an absent key, a
				-- null and the string "yes" all have to mean "they did not tick it"
				-- rather than raise and take the whole order down.
				coalesce(value -> 'frosting_matches_flavour' = 'true'::jsonb, false) as matches,
				nullif(regexp_replace(coalesce(value ->> 'frosting', ''), '^\s+|\s+$', '', 'g'), '')
					as wanted
		) frost
		group by 1, 2, 3, 4, 5, 6, 7, 8, 9
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
			from product_extras e
			where e.id = any (v_item.extra_ids)
				and e.product_id = v_product.id
				and e.is_available;

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
			note, inspiration_url, inspiration_image_paths, price_on_request,
			custom_flavour, frosting, frosting_matches_flavour
		)
		values (
			v_order_id, v_product.id, v_item.variant_id, v_product.name, v_variant.name,
			v_product.unit_label, v_item.qty, v_line, v_line_note,
			v_item.note, v_item.inspiration_url, v_item.image_paths, v_product.price_on_request,
			v_item.custom_flavour, v_item.frosting, v_item.frosting_matches_flavour
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
			from product_extras e
			where e.id = any (v_item.extra_ids) and e.product_id = v_product.id;
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

revoke execute on function place_order(
	jsonb, date, fulfilment_type, text, text, text, text, text, text, text, text[], text, time
) from public, anon, authenticated;

grant execute on function place_order(
	jsonb, date, fulfilment_type, text, text, text, text, text, text, text, text[], text, time
) to service_role;
