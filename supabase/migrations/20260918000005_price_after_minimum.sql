-- ---------------------------------------------------------------------------
-- A price for the first few, and a cheaper one for every one after that.
--
-- Mini cupcakes are the reason. They go out in boxes of twelve; twenty-four is
-- the smallest order, at $17.50 a box; every box after that is $15. There was
-- no way to say that. Bundle tiers are searched for the *cheapest* way to make
-- up a quantity, so a bundle priced above the unit rate is never chosen, and
-- "$35 for the first two" is exactly that. What the shop had instead was the
-- ladder written out a rung at a time:
--
--   3 together $50   4 together $65   5 together $80   6 together $95
--
-- which is the same rule four times over, and stops dead at the first person
-- who wants seven boxes.
--
-- So one column. `extra_unit_price_cents` is what each one past the minimum
-- costs; null, the default, means every one costs `unit_price_cents` and
-- nothing about the existing products changes.
--
-- Where the cheaper rate starts is the product's minimum rounded up to a whole
-- step, which is the number the shop already calls the minimum and already
-- shows on the page. Not a fifth column: the two would drift, and "the first
-- two" and "at least two" being the same two is the whole point of the price.
--
-- Bundle tiers and this are two answers to one question, and the admin refuses
-- both on one product. The function below does not search the tier table at all
-- when this is set, so a row that got there another way is ignored rather than
-- silently winning half the quantities.
--
-- Per line, exactly as the tiers are. A price for N of this product is a price
-- for N of one flavour. That is what makes the split order come out right:
-- twenty-four minis as two boxes in two flavours is two lines of one box, both
-- charged the first-box rate, $35 the same as two boxes of one flavour.
-- ---------------------------------------------------------------------------

alter table products
	add column extra_unit_price_cents int
		check (extra_unit_price_cents is null or extra_unit_price_cents >= 0);

comment on column products.extra_unit_price_cents is
	'What each one past the minimum costs. Null charges unit_price_cents for every one.';

-- ---------------------------------------------------------------------------
-- The line under the photo picker, in her words.
--
-- Same arrangement as note_hint and note_placeholder in 20260918000001, and
-- here for the same reason: the wording in the code says "A cake you've seen
-- and loved", which is right on a custom cake and wrong on a box of cupcakes.
-- Null means "say what InspirationPicker says", so the thirty products she has
-- not thought about keep the one good default.
--
-- Only ever read where wants_brief is on, because that is the only place the
-- picker is drawn at all.
-- ---------------------------------------------------------------------------

alter table products
	add column inspiration_hint text
		check (inspiration_hint is null or length(btrim(inspiration_hint)) between 1 and 500);

comment on column products.inspiration_hint is
	'The line under the photo picker, in her words. Null uses the wording in InspirationPicker.';

-- ---------------------------------------------------------------------------
-- price_for_qty, now able to charge the first few at a different rate.
--
-- The signature does not change, so this is a replace and the grants at the
-- bottom of the inspiration migration survive untouched. place_order calls
-- this and is not itself redefined here.
--
-- The new branch is not a dynamic program and does not need to be: which units
-- are the dear ones is decided by counting, not by searching for the cheapest
-- arrangement. A quantity that has not reached the minimum is simply that many
-- at the unit price, which is what one line of a split basket is made of.
--
-- The rate is the product's even when a variant is being priced, the same way
-- the bundle tiers are the product's. The note is built to read like the tier
-- notes it sits beside (the dearer part first, " + " between, "N x $X" for
-- singles), because lib/pricing.ts builds the same string in the browser and
-- tests/pricing-parity.test.ts asserts the two agree to the character.
-- ---------------------------------------------------------------------------

create or replace function price_for_qty(p_product_id uuid, p_qty int, p_variant_id uuid default null)
returns table (total_cents int, note text)
language plpgsql
stable
set search_path = public
as $fn$
declare
	p products%rowtype;
	-- The product's own price, or the chosen variant's in its place.
	v_unit_price int;
	-- How many are charged that price before the cheaper rate begins, and how
	-- many are left over at the cheaper one.
	v_minimum int;
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
		-- lib/pricing.ts works out from the same two columns. greatest(1, …)
		-- because a product with neither a minimum nor a step above one still has
		-- to have a first unit.
		v_minimum := greatest(
			1,
			case
				when p.min_per_order is null then p.qty_step
				else greatest(p.qty_step, ceil(p.min_per_order::numeric / p.qty_step)::int * p.qty_step)
			end
		);

		v_at_full := least(p_qty, v_minimum);
		v_extra := p_qty - v_at_full;

		-- Named as one price where there are several of them, because "the first
		-- two" is one number off the menu; "2 x $17.50 each" invites the reader to
		-- check the arithmetic on a figure they were handed whole.
		if v_at_full > 1 then
			v_note := format(
				'1 x %s for $%s',
				v_at_full,
				to_char(v_unit_price * v_at_full / 100.0, 'FM999990.00')
			);
		else
			v_note := format(
				'1 x $%s %s',
				to_char(v_unit_price / 100.0, 'FM999990.00'),
				p.unit_label
			);
		end if;

		if v_extra > 0 then
			v_note := v_note || format(
				' + %s x $%s %s',
				v_extra,
				to_char(p.extra_unit_price_cents / 100.0, 'FM999990.00'),
				p.unit_label
			);
		end if;

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
