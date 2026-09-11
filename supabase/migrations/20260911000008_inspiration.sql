-- ---------------------------------------------------------------------------
-- Inspiration: the picture a custom cake order is really made from.
--
-- Almost nobody describes a cake in words alone. They have a photo saved, or a
-- link to one, and until now there was nowhere to put it: the request arrived
-- as prose, and the owner had to email back asking for the picture before she
-- could price anything.
--
-- Photos are stored as object paths in the `order-inspiration` bucket (see the
-- storage migration beside this one), never as bytes in the row. The URL is
-- kept as the customer typed it, minus surrounding whitespace; nothing here
-- fetches it, and both of the places that render it as a link check the scheme
-- first (see lib/validation.ts).
-- ---------------------------------------------------------------------------

alter table orders
	add column inspiration_image_paths text[] not null default '{}'
		check (coalesce(array_length(inspiration_image_paths, 1), 0) <= 3),
	add column inspiration_url text
		check (inspiration_url is null or length(inspiration_url) <= 500);

comment on column orders.inspiration_image_paths is
	'Object paths in the order-inspiration bucket. At most three, oldest first.';
comment on column orders.inspiration_url is
	'A link the customer gave, as typed. Never fetched by anything here.';

-- ---------------------------------------------------------------------------
-- place_order again, taking the two new fields.
--
-- The arity changes, so the old function is dropped rather than replaced: two
-- overloads would both keep their grants, and the wrong one answering is not a
-- failure anyone would notice until an order arrived with its photos missing.
--
-- The new parameters are defaulted so that a caller written against the
-- previous signature — the race test, the setup check — still works.
-- ---------------------------------------------------------------------------
drop function place_order(
	jsonb, date, fulfilment_type, text, text, text, text, text, text, text
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

revoke execute on function place_order(
	jsonb, date, fulfilment_type, text, text, text, text, text, text, text, text[], text
) from public, anon, authenticated;

grant execute on function place_order(
	jsonb, date, fulfilment_type, text, text, text, text, text, text, text, text[], text
) to service_role;
