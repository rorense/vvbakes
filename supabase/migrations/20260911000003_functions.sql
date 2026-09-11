-- ---------------------------------------------------------------------------
-- Pricing and order placement.
--
-- These functions are the authoritative implementation. lib/pricing.ts and
-- lib/availability.ts mirror them so the browser can show a live total and a
-- list of bookable dates, but nothing the browser sends is trusted: every rule
-- is re-evaluated here, inside the transaction that writes the order.
-- ---------------------------------------------------------------------------

-- Cheapest way to buy `p_qty` of a product given its unit price and any bundle
-- tiers, plus a human-readable explanation of how that total was reached.
--
-- This is exact, not greedy. Greedy ("use the biggest bundle first") overcharges
-- whenever a smaller bundle has a better unit rate: with tiers of 4 for $12 and
-- 3 for $8, six units cost $16 as two threes, but greedy would charge $18. A
-- customer who can beat our own price with a calculator is a support ticket, so
-- this runs a small exact-cover dynamic program instead. p_qty is capped at a
-- few hundred by the caller, so the cost is irrelevant.
create or replace function price_for_qty(p_product_id uuid, p_qty int)
returns table (total_cents int, note text)
language plpgsql
stable
set search_path = public
as $fn$
declare
	p products%rowtype;
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

	best := array_fill(0::bigint, array[p_qty + 1]);
	pick := array_fill(0, array[p_qty + 1]);

	for i in 1..p_qty loop
		-- Baseline: one more single unit on top of the best price for i - 1.
		best[i + 1] := best[i] + p.unit_price_cents;
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
					to_char(p.unit_price_cents / 100.0, 'FM999990.00'),
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
		group by u.c, p.unit_price_cents, p.unit_label
	) parts;

	return query select best[p_qty + 1]::int, v_note;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Aggregate order counts per pickup date.
--
-- This is the one thing anon may learn about orders, and only in aggregate: the
-- order form needs it to show "2 spots left" and to hide dates that are full. It
-- exposes no customer data, no totals and no order contents.
-- ---------------------------------------------------------------------------
create or replace function order_counts_between(p_from date, p_to date)
returns table (pickup_date date, order_count int)
language sql
stable
security definer
set search_path = public
as $fn$
	select o.pickup_date, count(*)::int
	from orders o
	where o.pickup_date between p_from and p_to
		and o.status <> 'cancelled'
	group by o.pickup_date;
$fn$;

revoke execute on function order_counts_between(date, date) from public;
grant execute on function order_counts_between(date, date) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Place an order.
--
-- SUPERSEDED. This version requires at least one line item. A later migration,
-- 20260911000005_custom_orders.sql, replaces it with one that also accepts a
-- custom cake request and no items. Read that file for the current behaviour;
-- this one is kept only so the migration history still replays from scratch.
--
-- Every failure mode raises a named exception; the server action maps those to
-- customer-facing copy. Callable only with the service role, from the server.
--
-- The advisory lock is what makes capacity real. Without it, two customers
-- loading the last slot at the same time both read count = capacity - 1 and both
-- insert. The lock is taken on the pickup date and held until the transaction
-- ends, so the second caller waits, re-reads, and gets DATE_FULL.
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
	p_ip_hash text
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
	v_line int;
	v_line_note text;
	v_subtotal int := 0;
	v_fee int := 0;
	v_number int;
	v_order_id uuid;
	v_token text;
	v_reference text;
begin
	select * into s from site_settings where site_settings.id = 1;
	if not found then
		raise exception 'SETTINGS_MISSING';
	end if;

	if not s.orders_open then
		raise exception 'ORDERS_CLOSED';
	end if;

	if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
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
		if coalesce(btrim(p_delivery_address), '') = '' then
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
		delivery_address, notes, custom_request, ip_hash
	)
	values (
		v_number, v_reference, p_fulfilment, p_pickup_date,
		btrim(p_customer_name), lower(btrim(p_customer_email)), btrim(p_customer_phone),
		nullif(btrim(coalesce(p_delivery_address, '')), ''),
		nullif(btrim(coalesce(p_notes, '')), ''),
		nullif(btrim(coalesce(p_custom_request, '')), ''),
		p_ip_hash
	)
	returning orders.id, orders.token into v_order_id, v_token;

	-- Quantities are summed per product first. A cart that lists the same product
	-- twice must not become two lines, and must not slip past max_per_order.
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

		if v_item.qty < 1
			or v_item.qty % v_product.qty_step <> 0
			or (v_product.max_per_order is not null and v_item.qty > v_product.max_per_order)
		then
			raise exception 'QTY_INVALID';
		end if;

		select f.total_cents, f.note into v_line, v_line_note
		from price_for_qty(v_product.id, v_item.qty) f;

		insert into order_items (
			order_id, product_id, product_name, unit_label, qty, line_total_cents, pricing_note
		)
		values (
			v_order_id, v_product.id, v_product.name, v_product.unit_label,
			v_item.qty, v_line, v_line_note
		);

		v_subtotal := v_subtotal + v_line;
	end loop;

	update orders o
	set subtotal_cents = v_subtotal,
		delivery_fee_cents = v_fee,
		total_cents = v_subtotal + v_fee
	where o.id = v_order_id;

	insert into order_events (order_id, type, data)
	values (v_order_id, 'created', jsonb_build_object('reference', v_reference));

	return query select v_order_id, v_token, v_reference, (v_subtotal + v_fee);
end;
$fn$;

revoke execute on function place_order(
	jsonb, date, fulfilment_type, text, text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function place_order(
	jsonb, date, fulfilment_type, text, text, text, text, text, text, text
) to service_role;
