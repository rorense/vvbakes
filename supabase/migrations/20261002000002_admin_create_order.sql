-- ---------------------------------------------------------------------------
-- The owner putting an order in by hand.
--
-- Orders also arrive by text, by Instagram message and across the counter, and
-- until now the only way to get one of those onto the order list was to fill in
-- the shop's own form as if she were the customer, against the shop's own lead
-- time and capacity. The admin orders page gains a "New order" form, and this
-- is what it calls.
--
-- It writes the bare order and then hands the lines to edit_order_items, in the
-- same transaction, so a hand-made order is priced by exactly the rules that
-- price a line she adds to any other order: today's menu, the quantity step
-- enforced, the "after the minimum" allowance counted across lines, no custom
-- cakes without a brief. One set of pricing rules, not two to keep in step.
--
-- Deliberately not checked, the same way the details correction and
-- edit_order_items do not: lead time, the booking window, the day's capacity,
-- whether a product is on the shop, and the per-address spam brake. Those stop
-- a customer booking what cannot be baked; she is the one who decides what can.
--
-- The order starts at 'new' like any other, so it goes through confirming,
-- and the bank details email, the same way. Nothing is emailed here: the admin
-- action does not send, and "Send the latest email again" on the order page is
-- how the customer hears about it if she wants them to.
--
-- edit_order_items leaves a `details_edited` entry saying the lines went from
-- nothing to something. On an order that did not exist a moment ago that reads
-- as a change nobody made, so it is taken back out, and the `created` entry
-- says who put the order in instead.
-- ---------------------------------------------------------------------------

create function admin_create_order(
	p_items jsonb,
	p_pickup_date date,
	p_pickup_time time,
	p_fulfilment fulfilment_type,
	p_customer_name text,
	p_customer_email text,
	p_customer_phone text,
	p_delivery_address text,
	p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
	v_fee int;
	v_number int;
	v_reference text;
	v_order_id uuid;
begin
	if not is_admin() then
		raise exception 'NOT_ADMIN';
	end if;

	-- The fee as it stands. A check constraint holds it at 0 while the fee is
	-- quoted by hand, which is what place_order relies on too.
	select case when p_fulfilment = 'delivery' then s.delivery_fee_cents else 0 end
	into v_fee
	from site_settings s
	where s.id = 1;

	v_number := nextval('order_number_seq');
	v_reference := 'VV' || v_number::text;

	insert into orders (
		order_number, reference, fulfilment, pickup_date, pickup_time,
		customer_name, customer_email, customer_phone,
		delivery_address, notes, delivery_fee_cents, total_cents
	)
	values (
		v_number, v_reference, p_fulfilment, p_pickup_date, p_pickup_time,
		btrim(p_customer_name), lower(btrim(p_customer_email)), btrim(p_customer_phone),
		nullif(regexp_replace(coalesce(p_delivery_address, ''), '^\s+|\s+$', '', 'g'), ''),
		nullif(regexp_replace(coalesce(p_notes, ''), '^\s+|\s+$', '', 'g'), ''),
		coalesce(v_fee, 0),
		coalesce(v_fee, 0)
	)
	returning orders.id into v_order_id;

	insert into order_events (order_id, type, data)
	values (v_order_id, 'created', jsonb_build_object('reference', v_reference, 'by', 'owner'));

	perform edit_order_items(v_order_id, p_items);

	-- edit_order_items returns early, and quietly, when it is handed nothing to
	-- do, so an empty list is caught here rather than there.
	if not exists (select 1 from order_items oi where oi.order_id = v_order_id) then
		raise exception 'EMPTY_ORDER';
	end if;

	delete from order_events e where e.order_id = v_order_id and e.type = 'details_edited';

	return v_order_id;
end;
$fn$;

-- Signed-in only, as edit_order_items. The function checks is_admin() itself,
-- because security definer would otherwise let any signed-in user add orders.
revoke execute on function admin_create_order(
	jsonb, date, time, fulfilment_type, text, text, text, text, text
) from public, anon;
grant execute on function admin_create_order(
	jsonb, date, time, fulfilment_type, text, text, text, text, text
) to authenticated;
