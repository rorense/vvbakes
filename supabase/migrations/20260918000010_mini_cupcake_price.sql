-- ---------------------------------------------------------------------------
-- The minis onto the price she actually asked for: two boxes, then $15 a box.
--
-- 20260918000005 added `extra_unit_price_cents` and taught price_for_qty to use
-- it. It is still null on the live shop, so the minis are running on the bundle
-- ladder it was meant to replace:
--
--   3 together $50   4 together $65   5 together $80   6 together $95
--
-- Those four rungs are correct as far as they go, and they stop at six. All six
-- flavours are priced at $17.50, so today the seventh box falls back to full
-- price and the page quotes
--
--   1 x 6 for $95.00 + 1 x $17.50 box of 12   =   $112.50
--
-- where the rule she wrote down says $110. Every box past the sixth is $2.50
-- over, and it grows.
--
-- So: the four tier rows go, and the rate replaces them. After this, every
-- quantity is the first two at the flavour's own price plus $15 a box for the
-- rest, with no last rung to fall off. $35, $50, $65, $80, $95, $110, and on.
--
-- The two cannot both stay. A bundle is only ever chosen when it is the
-- *cheapest* way to make up a quantity, so leaving the rungs in place would let
-- them win some quantities and not others; the admin refuses to save a product
-- holding both, and this does what it would make her do by hand.
--
-- Order matters. The delete is guarded on the rate still being null, so it runs
-- once and only as part of this change: a re-run finds the rate already set and
-- touches nothing, including any bundle she may have chosen to add back.
--
-- Nothing here changes what a flavour costs. `unit_price_cents` on the product
-- row is left at its $16.00, which is unread while every flavour carries its
-- own price and is not this migration's business to correct.
--
-- Matched on the slug the way 20260918000009 is, and for the same reason: the
-- live row is `mini-cupcakes` while supabase/seed.sql calls it
-- `cupcakes-mini-sized`. Requiring both fragments catches the two of them and
-- nothing else, in particular not the regular sized cupcakes, which keep their
-- own 4 for $12.
-- ---------------------------------------------------------------------------

delete from product_price_tiers
where product_id in (
	select id from products
	where extra_unit_price_cents is null
		and slug like '%mini%'
		and slug like '%cupcake%'
);

update products
set extra_unit_price_cents = 1500
where extra_unit_price_cents is null
	and slug like '%mini%'
	and slug like '%cupcake%';
