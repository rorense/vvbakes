-- ---------------------------------------------------------------------------
-- Three or more boxes is $15 a box, whatever the flavours.
--
-- 20260918000005 gave the minis a price for the first few and a cheaper one
-- after, and priced it per line, because that is what bundle tiers have always
-- done: a price for N of a product is a price for N of one flavour. So three
-- boxes came to $50 as three vanilla and $52.50 as one each of three, and four
-- boxes to $65 or $70 depending on how they were split.
--
-- That is not the rule. The rule is about the order: twenty-four minis is the
-- smallest order at $17.50 a box, and every box after those two is $15,
-- however many flavours they are spread across. Three boxes is $50, full stop.
--
-- So a product's lines are priced together rather than one at a time. The
-- first `min_per_order` units of a product, counted across every line of it on
-- the order, are charged the unit price; everything after is charged
-- `extra_unit_price_cents`.
--
-- Two things follow, and both are deliberate.
--
-- The allowance goes to the cheapest units first, which leaves the customer
-- paying the least. That is the side price_for_qty already takes when it
-- searches the bundle table for the cheapest way to make a quantity up, so it
-- is the house rule rather than a new one. It only bites where one product's
-- flavours are priced differently from each other; the minis are all $17.50.
--
-- The note on a line now names the rates per unit, "2 x $17.50 box of 12 + 1 x
-- $15.00 box of 12", where it used to say "1 x 2 for $35.00". The old wording
-- quoted the first two boxes as something that line bought. Under this rule
-- they are not: they are where the order's allowance happened to run out, and
-- the line simply bought some boxes at one rate and some at another.
--
-- Nothing changes for a product with no `extra_unit_price_cents`, which is
-- every product but the minis. `p_already` defaults to zero, the branch it
-- feeds is not reached, and the bundle search underneath is untouched.
-- ---------------------------------------------------------------------------

-- The arity changes, so the old function is dropped rather than replaced: a
-- defaulted fourth parameter alongside it would leave two candidates for every
-- existing three-argument call and Postgres would refuse them as ambiguous.
-- Same reasoning as 20260915000003, which did this for the variant. There are
-- no grants on this function to lose, and place_order is redefined below and
-- keeps its own.
drop function price_for_qty(uuid, int, uuid);

create function price_for_qty(
	p_product_id uuid,
	p_qty int,
	p_variant_id uuid default null,
	-- How many of this product earlier lines of the same order already took,
	-- and so how much of the full-price allowance is already spent. Zero prices
	-- a line standing on its own, which is what the product page asks for.
	p_already int default 0
)
returns table (total_cents int, note text)
language plpgsql
stable
set search_path = public
as $fn$
declare
	p products%rowtype;
	-- The product's own price, or the chosen variant's in its place.
	v_unit_price int;
	-- Where the cheaper rate starts, how much of the allowance is left for this
	-- line, and how the line splits between the two rates.
	v_minimum int;
	v_allowance int;
	v_at_full int;
	v_extra int;
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

	if p.extra_unit_price_cents is not null then
		-- The minimum rounded up to a whole step, which is what minOrderQty in
		-- lib/pricing.ts works out from the same two columns.
		v_minimum := greatest(
			1,
			case
				when p.min_per_order is null then p.qty_step
				else greatest(p.qty_step, ceil(p.min_per_order::numeric / p.qty_step)::int * p.qty_step)
			end
		);

		v_allowance := greatest(0, v_minimum - greatest(0, coalesce(p_already, 0)));
		v_at_full := least(p_qty, v_allowance);
		v_extra := p_qty - v_at_full;

		-- Dearest rate first, and the full-price part first where the two rates
		-- are the same number, so the wording is stable. Built from a values list
		-- because lib/pricing.ts builds it from a list too, and
		-- tests/pricing-parity.test.ts compares the two to the character.
		select string_agg(
			format('%s x $%s %s', part.n, to_char(part.cents / 100.0, 'FM999990.00'), p.unit_label),
			' + ' order by part.cents desc, part.ord
		)
		into v_note
		from (values (1, v_at_full, v_unit_price), (2, v_extra, p.extra_unit_price_cents))
			as part (ord, n, cents)
		where part.n > 0;

		return query select
			(v_unit_price * v_at_full + p.extra_unit_price_cents * v_extra)::int,
			v_note;
		return;
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
-- place_order, now pricing each product's lines as one order.
--
-- The signature is unchanged, so this is a replace and the grants at the bottom
-- of the inspiration migration survive untouched. Everything above the second
-- pass is exactly as 20260918000011 left it; the change is a window function on
-- the line query and a fourth argument handed to price_for_qty.
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
	--
	-- A combination carrying a minimum of its own is left out of that sum and
	-- counted on its own below. The chiffon is what that is for: eight is a
	-- rule about slices, and one whole cake is one whole cake.
	for v_item in
		select
			(item.value ->> 'product_id')::uuid as product_id,
			(sum((item.value ->> 'qty')::int)
				filter (where v.min_per_order is null))::int as qty
		from jsonb_array_elements(p_items) as item (value)
		left join product_variants v
			on v.id = nullif(item.value ->> 'variant_id', '')::uuid
		group by 1
	loop
		select * into v_product from products where products.id = v_item.product_id;
		if not found or not v_product.is_available then
			raise exception 'PRODUCT_UNAVAILABLE';
		end if;

		-- Null rather than zero when every line of this product counts on its
		-- own. The product's minimum has nothing left to be a rule about, and
		-- comparing it against zero would refuse an order for one whole cake.
		if v_product.min_per_order is not null
			and v_item.qty is not null
			and v_item.qty < v_product.min_per_order
		then
			raise exception 'QTY_BELOW_MINIMUM';
		end if;
	end loop;

	-- The combinations that count on their own, each against its own minimum.
	-- Whether one exists, is available and belongs to the product it was sent
	-- with is the second pass's business; this one only asks how many.
	for v_item in
		select
			nullif(item.value ->> 'variant_id', '')::uuid as variant_id,
			sum((item.value ->> 'qty')::int)::int as qty
		from jsonb_array_elements(p_items) as item (value)
		where nullif(item.value ->> 'variant_id', '') is not null
		group by 1
	loop
		select * into v_variant
		from product_variants
		where product_variants.id = v_item.variant_id;

		if found
			and v_variant.min_per_order is not null
			and v_item.qty < v_variant.min_per_order
		then
			raise exception 'QTY_BELOW_MINIMUM';
		end if;
	end loop;

	-- Second pass: one line per flavour, set of extras and brief. Quantities are
	-- summed within a line, so a basket listing the same thing twice does not
	-- become two rows. Grouping treats two nulls as equal, which is what keeps a
	-- product with no variants and no brief coming out as the single line it has
	-- always been. The extras are reduced to a sorted, rolled-up jsonb array
	-- first so that the same two extras picked in the other order are recognised
	-- as the same line; they carry their counts, so six candles and one candle
	-- are two lines the way candles and no candles already were. The photo paths
	-- are deliberately *not* sorted, because the order a customer arranged their
	-- references in is part of the brief.
	for v_item in
		with lines as (
		select
			(value ->> 'product_id')::uuid as product_id,
			nullif(value ->> 'variant_id', '')::uuid as variant_id,
			chosen.extras as extras,
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
			-- Sorted by id and rolled up to one entry per extra, so that the same
			-- two picked in either order come out as the same jsonb value and land
			-- on one line. A duplicated id is one entry at the larger count:
			-- someone who asked for six and then for one asked for six.
			select coalesce(
				jsonb_agg(jsonb_build_object('id', picked.id, 'qty', picked.qty) order by picked.id),
				'[]'::jsonb
			) as extras
			from (
				select asked.id, max(asked.qty)::int as qty
				from (
					-- What the order form sends now: an id and how many of it.
					select
						(e.value ->> 'id')::uuid as id,
						-- Read as text and checked before it is cast. A qty of "lots"
						-- is a caller doing something other than ordering a cake, and
						-- must not take the whole order down with a cast error;
						-- anything that is not a plain number counts as one.
						case
							when (e.value ->> 'qty') ~ '^[0-9]+$'
								then greatest((e.value ->> 'qty')::int, 1)
							else 1
						end as qty
					from jsonb_array_elements(
						case
							when jsonb_typeof(value -> 'extras') = 'array' then value -> 'extras'
							else '[]'::jsonb
						end
					) as e
					where jsonb_typeof(e.value) = 'object' and (e.value ->> 'id') is not null
					union all
					-- And what it sent before quantities existed, which still means
					-- one of each. Kept because the signature is unchanged and a
					-- caller written against the older one has to go on working.
					select x::uuid, 1
					from jsonb_array_elements_text(
						case
							when jsonb_typeof(value -> 'extra_ids') = 'array' then value -> 'extra_ids'
							else '[]'::jsonb
						end
					) as x
				) asked
				group by asked.id
			) picked
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
		)
		-- How many of this product earlier lines have already taken, which is
		-- what decides whether this line is still inside the full-price allowance.
		--
		-- Cheapest first, then the biggest quantity, then the flavour's id. The
		-- allowance runs out inside one of these lines and which line that is
		-- decides how the product's total is split between them; the total itself
		-- is the same whichever way they are walked. lib/pricing.ts sorts on the
		-- same three so that each line's own figure is the same in the basket and
		-- on the order it becomes.
		--
		-- Two lines of one product can still tie on all three, by being the same
		-- flavour in the same number and differing only in what was typed about
		-- them. The split between that pair is then whichever way the database
		-- walked them, and nobody pays a different total for it.
		select
			lines.*,
			coalesce(sum(lines.qty) over (
				partition by lines.product_id
				order by
					coalesce(pv.unit_price_cents, pr.unit_price_cents),
					lines.qty desc,
					lines.variant_id nulls first
				rows between unbounded preceding and 1 preceding
			), 0)::int as taken
		from lines
		join products pr on pr.id = lines.product_id
		left join product_variants pv on pv.id = lines.variant_id
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

		-- The extras on this line, priced as the list stands right now, and
		-- counted as the customer asked for them: six candles is six times the
		-- price of one, on each cake the line carries.
		--
		-- Counted rather than checked one at a time: an id that names nothing and
		-- an id that names something switched off are the same answer to the
		-- customer, and both have to stop the order rather than quietly dropping
		-- the candles off a birthday cake.
		--
		-- Priced even on a line whose cake is not: candles cost what candles cost
		-- whether or not the cake under them has been quoted yet.
		v_extras_total := 0;

		if jsonb_array_length(v_item.extras) > 0 then
			select count(*)::int, coalesce(sum(e.price_cents * c.qty), 0)::int
			into v_extra_count, v_extras_unit
			from jsonb_to_recordset(v_item.extras) as c(id uuid, qty int)
			join product_extras e
				on e.id = c.id
				and e.product_id = v_product.id
				and e.is_available;

			if v_extra_count <> jsonb_array_length(v_item.extras) then
				raise exception 'EXTRA_UNAVAILABLE';
			end if;

			-- More of something than she sells. The basket is localStorage and the
			-- cap is hers to lower, so a saved basket can ask for ten of an extra
			-- she now allows six of. Refused rather than quietly cut down to six,
			-- for the same reason a sold-out extra is refused rather than dropped:
			-- what arrives has to be what was agreed to.
			--
			-- Checked after the lookup above, so an id that names nothing is still
			-- EXTRA_UNAVAILABLE rather than falling through this join and passing.
			if exists (
				select 1
				from jsonb_to_recordset(v_item.extras) as c(id uuid, qty int)
				join product_extras e on e.id = c.id and e.product_id = v_product.id
				where c.qty > e.max_qty
			) then
				raise exception 'EXTRA_QTY_INVALID';
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
			from price_for_qty(v_product.id, v_item.qty, v_item.variant_id, v_item.taken) f;
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

		-- Snapshotted: the name, the price of one, and how many of it. A free
		-- extra is a real one, so this is driven by how many were chosen rather
		-- than by what they came to.
		--
		-- `qty` is the line's own quantity and `unit_qty` is how many of the extra
		-- ride on each unit of it, so two cakes with six candles each reads as
		-- what it is rather than as twelve candles on an unknown number of cakes.
		if jsonb_array_length(v_item.extras) > 0 then
			insert into order_item_extras (
				order_item_id, extra_id, name, qty, unit_qty,
				unit_price_cents, line_total_cents, sort_order
			)
			select
				v_order_item_id, e.id, e.name, v_item.qty, c.qty,
				e.price_cents, e.price_cents * c.qty * v_item.qty, e.sort_order
			from jsonb_to_recordset(v_item.extras) as c(id uuid, qty int)
			join product_extras e on e.id = c.id and e.product_id = v_product.id;
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
