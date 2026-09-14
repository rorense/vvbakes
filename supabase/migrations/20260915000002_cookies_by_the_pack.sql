-- ---------------------------------------------------------------------------
-- Cookies are sold by the pack, not by the cookie.
--
-- Every flavour was priced $2.50 each with a step of 2, so every cookie card in
-- the shop advertised itself as "2 for $5". That reads like a two-cookie
-- minimum on something that is really one thing you buy, and it made the basket
-- count cookies while the baker counts packs. The pack becomes the unit: $5, no
-- step, and what is inside a pack is spelled out in the description.
--
-- Scoped to the Cookies category rather than a list of slugs. There were four
-- flavours when this was written and the seed knows about one, so naming them
-- would miss whichever were added in between, or since.
--
-- Guarded on the old shape throughout, so a price the owner has already changed
-- in /admin is left exactly as she set it. Orders that have been placed keep
-- their own snapshot in order_items and are not touched by any of this.
-- ---------------------------------------------------------------------------

update products p
set
	unit_price_cents = 500,
	unit_label = 'pack',
	qty_step = 1
from categories c
where p.category_id = c.id
	and c.slug = 'cookies'
	and p.unit_price_cents = 250
	and p.unit_label = 'each'
	and p.qty_step = 2
	-- A bundle row would mean a pricing shape other than the one being replaced.
	and not exists (select 1 from product_price_tiers t where t.product_id = p.id);

-- Say what is in a pack, after whatever the owner has written about the flavour.
-- Anything that already says it is skipped, so this adds nothing on a re-run,
-- and so is copy long enough that the extra sentence would run past the 1000
-- character limit the column allows.
update products p
set description = case
		when p.description is null or btrim(p.description) = ''
			then 'Each pack comes with two cookies.'
		else btrim(p.description) || ' Each pack comes with two cookies.'
	end
from categories c
where p.category_id = c.id
	and c.slug = 'cookies'
	and p.unit_label = 'pack'
	and (p.description is null or p.description not ilike '%pack comes with two cookies%')
	and length(coalesce(btrim(p.description), '')) <= 960;
