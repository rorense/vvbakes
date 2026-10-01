-- ---------------------------------------------------------------------------
-- The owner changing what is on an order.
--
-- A customer texts "can I add another box" or "make that two, not three", and
-- until now the only answers were the Supabase table editor or cancelling the
-- order and asking them to place it again. The admin order page gains a form
-- for it, and this is what that form calls.
--
-- One function rather than admin write policies on order_items, because the
-- change is several writes that only mean anything together: the lines, their
-- extras, the order's subtotal and total, and the trail. Half of that landing
-- is an order whose total disagrees with its lines.
--
-- `p_items` lists only what changes:
--
--   { "id": "<order_items.id>", "qty": 4 }      that line, now four; 0 removes it
--   { "product_id": "...", "variant_id": "...", "qty": 2 }      a new line
--
-- Pricing follows three rules.
--
-- A line nobody touched keeps the price it was ordered at. Lines are the
-- order's history, and quietly repricing them at today's menu would change what
-- the customer was told without anybody deciding to.
--
-- A changed or new line is priced by price_for_qty, as the menu stands now,
-- which is what the customer would be charged if they ordered it today.
--
-- The one exception to the first rule is a product priced "the first few, then
-- cheaper" (extra_unit_price_cents). Its allowance is counted across every line
-- of that product, so a change to one line moves where the allowance runs out,
-- and every line of that product is priced again together, walked in the same
-- order place_order walks them.
--
-- Deliberately not checked, the same way the details correction does not
-- re-check the calendar: availability and minimums. Those stop a customer
-- ordering what cannot be baked; she is the one who decides what can be. The
-- quantity step is still enforced, because a box of six cannot be sold as five.
--
-- Not offered: adding a price-on-request product. A custom cake line is a
-- brief, with photos and words, and a bare line with none of that is nothing to
-- quote against.
--
-- The trail entry is a `details_edited`, carrying `items` (name, from, to) and
-- `total_cents` (from, to), so no change to the event type check is needed.
-- ---------------------------------------------------------------------------

create function edit_order_items(p_order_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
	v_order orders%rowtype;
	v_item record;
	v_line order_items%rowtype;
	v_product products%rowtype;
	v_variant product_variants%rowtype;
	v_qty int;
	v_new_id uuid;
	-- Lines to price again, and the products they belong to. The second is what
	-- reaches the untouched lines of an "after the minimum" product.
	v_touched uuid[] := '{}';
	v_products uuid[] := '{}';
	v_changes jsonb := '[]'::jsonb;
	v_subtotal int;
	v_total int;
begin
	if not is_admin() then
		raise exception 'NOT_ADMIN';
	end if;

	-- Locked, so two saves from two tabs cannot both read the old lines and
	-- each write a total that misses the other's change.
	select * into v_order from orders o where o.id = p_order_id for update;
	if not found then
		raise exception 'ORDER_NOT_FOUND';
	end if;

	if p_items is null or jsonb_typeof(p_items) <> 'array' then
		raise exception 'ITEMS_INVALID';
	end if;

	for v_item in select value from jsonb_array_elements(p_items) loop
		-- Read as text and checked before the cast, and capped at four digits so
		-- a typo cannot overflow the cast and surface as a Postgres error.
		if jsonb_typeof(v_item.value) <> 'object'
			or coalesce(v_item.value ->> 'qty', '') !~ '^[0-9]{1,4}$'
		then
			raise exception 'QTY_INVALID';
		end if;

		v_qty := (v_item.value ->> 'qty')::int;

		if v_item.value ? 'id' then
			select * into v_line
			from order_items oi
			where oi.id = (v_item.value ->> 'id')::uuid and oi.order_id = p_order_id;

			if not found then
				raise exception 'LINE_NOT_FOUND';
			end if;

			continue when v_qty = v_line.qty;

			v_changes := v_changes || jsonb_build_object(
				'name', v_line.product_name || coalesce(' (' || v_line.variant_name || ')', ''),
				'from', v_line.qty,
				'to', v_qty
			);

			if v_line.product_id is not null then
				v_products := v_products || v_line.product_id;
			end if;

			if v_qty = 0 then
				-- Its extras go with it, by the foreign key's cascade.
				delete from order_items oi where oi.id = v_line.id;
				continue;
			end if;

			select * into v_product from products p where p.id = v_line.product_id;
			if not found then
				-- Deleted from the menu since. Removing the line still works; a new
				-- quantity has nothing to be priced against.
				raise exception 'PRODUCT_NOT_FOUND';
			end if;

			if v_qty % v_product.qty_step <> 0 then
				raise exception 'QTY_INVALID';
			end if;

			update order_items oi set qty = v_qty where oi.id = v_line.id;

			-- The extras ride on each unit, so they follow the quantity, at the
			-- price they were snapshotted at.
			update order_item_extras e
			set qty = v_qty, line_total_cents = e.unit_price_cents * e.unit_qty * v_qty
			where e.order_item_id = v_line.id;

			v_touched := v_touched || v_line.id;
		else
			if v_qty < 1 then
				raise exception 'QTY_INVALID';
			end if;

			select * into v_product
			from products p
			where p.id = nullif(v_item.value ->> 'product_id', '')::uuid;

			if not found then
				raise exception 'PRODUCT_NOT_FOUND';
			end if;

			if v_product.price_on_request then
				raise exception 'PRICE_ON_REQUEST';
			end if;

			if v_qty % v_product.qty_step <> 0 then
				raise exception 'QTY_INVALID';
			end if;

			-- Cleared each time round, as in place_order, so a flavour from an
			-- earlier line cannot be written onto a product that has none.
			v_variant := null;

			if exists (select 1 from product_variants pv where pv.product_id = v_product.id) then
				select * into v_variant
				from product_variants pv
				where pv.id = nullif(v_item.value ->> 'variant_id', '')::uuid
					and pv.product_id = v_product.id;

				if not found then
					raise exception 'VARIANT_REQUIRED';
				end if;
			elsif nullif(v_item.value ->> 'variant_id', '') is not null then
				raise exception 'VARIANT_NOT_FOUND';
			end if;

			-- Priced below with everything else that moved.
			insert into order_items (
				order_id, product_id, product_variant_id, product_name, variant_name,
				unit_label, qty, line_total_cents
			)
			values (
				p_order_id, v_product.id, v_variant.id, v_product.name, v_variant.name,
				v_product.unit_label, v_qty, 0
			)
			returning order_items.id into v_new_id;

			v_touched := v_touched || v_new_id;
			v_products := v_products || v_product.id;

			v_changes := v_changes || jsonb_build_object(
				'name', v_product.name || coalesce(' (' || v_variant.name || ')', ''),
				'from', 0,
				'to', v_qty
			);
		end if;
	end loop;

	-- Saved untouched: nothing written, nothing in the trail.
	if jsonb_array_length(v_changes) = 0 then
		return;
	end if;

	-- An order has to be something, the same rule place_order holds a customer
	-- to. Taking everything off is what cancelling is for.
	if not exists (select 1 from order_items oi where oi.order_id = p_order_id)
		and coalesce(v_order.custom_request, '') !~ '[^[:space:]]'
		and coalesce(array_length(v_order.inspiration_image_paths, 1), 0) = 0
		and v_order.inspiration_url is null
	then
		raise exception 'EMPTY_ORDER';
	end if;

	-- `taken` is worked out over every line of the product, in place_order's own
	-- order, so a reprice here lands each line where the order form would have.
	for v_item in
		select
			oi.id,
			oi.product_id,
			oi.product_variant_id,
			oi.qty,
			pr.extra_unit_price_cents,
			coalesce(sum(oi.qty) over (
				partition by oi.product_id
				order by
					coalesce(pv.unit_price_cents, pr.unit_price_cents),
					oi.qty desc,
					oi.product_variant_id nulls first
				rows between unbounded preceding and 1 preceding
			), 0)::int as taken
		from order_items oi
		join products pr on pr.id = oi.product_id
		left join product_variants pv on pv.id = oi.product_variant_id
		where oi.order_id = p_order_id and not oi.price_on_request
	loop
		continue when not (
			v_item.id = any(v_touched)
			or (v_item.extra_unit_price_cents is not null and v_item.product_id = any(v_products))
		);

		update order_items oi
		set (line_total_cents, pricing_note) = (
			select f.total_cents, f.note
			from price_for_qty(v_item.product_id, v_item.qty, v_item.product_variant_id, v_item.taken) f
		)
		where oi.id = v_item.id;
	end loop;

	-- From the lines rather than by adjusting the old figure, so the total is
	-- whatever the lines now say even if it had drifted before.
	select coalesce(sum(
		oi.line_total_cents
		+ coalesce((
			select sum(e.line_total_cents) from order_item_extras e where e.order_item_id = oi.id
		), 0)
	), 0)::int
	into v_subtotal
	from order_items oi
	where oi.order_id = p_order_id;

	v_total := v_subtotal + v_order.delivery_fee_cents + v_order.quote_cents;

	update orders o
	set subtotal_cents = v_subtotal, total_cents = v_total
	where o.id = p_order_id;

	insert into order_events (order_id, type, data)
	values (
		p_order_id,
		'details_edited',
		jsonb_build_object(
			'items', v_changes,
			'total_cents', jsonb_build_object('from', v_order.total_cents, 'to', v_total)
		)
	);
end;
$fn$;

-- Signed-in only, named explicitly, as 20260911000007 explains. The function
-- checks is_admin() itself, because security definer would otherwise let any
-- signed-in user rewrite any order.
revoke execute on function edit_order_items(uuid, jsonb) from public, anon;
grant execute on function edit_order_items(uuid, jsonb) to authenticated;
