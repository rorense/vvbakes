-- ---------------------------------------------------------------------------
-- The custom cake's size picker says what the price guide says.
--
-- 20260917000001 gave the custom cake a table of starting prices written in
-- inches and layers, "6 inch, 2 layers, from $45". The picker underneath it was
-- still the one seeded in 20260916000003, which asks in headcount: "Six to
-- eight people", "Ten to twelve people". So the page quoted a price for a size
-- the customer could not then choose, and asked for a size that had no price.
-- One of the two had to move, and it is this one: the prices are hers, the
-- headcount was a guess made before there were any.
--
-- The headcount is not lost. The brief right underneath asks how many people in
-- so many words, and so does the home page, and a number typed there is worth
-- more than a bracket picked off a list.
--
-- Three of the five rows are renamed rather than replaced, so the ids survive.
-- Nothing points at a variant's *name*, since `order_items` snapshots it at
-- the moment the order is placed. But a basket sitting in someone's
-- localStorage points at the id, and replacing the rows would empty it at the
-- till.
--
-- Every statement is guarded twice over:
--
--   * by the old name, so a row the owner has already reworded is left exactly
--     as she reworded it, and
--   * by the new one not already being taken, because `product_variants` is
--     unique on (product_id, name) and a half-applied migration must not be a
--     failed one.
--
-- Which makes the whole file re-runnable and makes it a no-op on any install
-- where she got there first.
-- ---------------------------------------------------------------------------

-- The two rows that keep their wording move down to make room for the fourth
-- size. Done before the renames so that nothing lands on a sort_order twice,
-- and highest first so the two do not collide with each other on the way.
update product_variants v
set sort_order = 6
from products p
where p.id = v.product_id and p.slug = 'custom-cake' and v.name = 'Not sure yet';

update product_variants v
set sort_order = 5
from products p
where p.id = v.product_id and p.slug = 'custom-cake' and v.name = 'Two tiers';

-- The three headcount brackets become the three sizes that already have a
-- price, in the order they were in: smallest first.
update product_variants v
set name = '6" - 2 layers', sort_order = 1
from products p
where p.id = v.product_id
	and p.slug = 'custom-cake'
	and v.name = 'Six to eight people'
	and not exists (
		select 1 from product_variants taken
		where taken.product_id = v.product_id and taken.name = '6" - 2 layers'
	);

update product_variants v
set name = '6" - 3 layers', sort_order = 2
from products p
where p.id = v.product_id
	and p.slug = 'custom-cake'
	and v.name = 'Ten to twelve people'
	and not exists (
		select 1 from product_variants taken
		where taken.product_id = v.product_id and taken.name = '6" - 3 layers'
	);

update product_variants v
set name = '8" - 2 layers', sort_order = 3
from products p
where p.id = v.product_id
	and p.slug = 'custom-cake'
	and v.name = 'Fifteen to twenty people'
	and not exists (
		select 1 from product_variants taken
		where taken.product_id = v.product_id and taken.name = '8" - 2 layers'
	);

-- The fourth priced size has no row to rename into, so it is created. Hung off
-- the third one existing rather than off the slug alone: that is what says the
-- renames above actually ran here, so an install that has been reworked by hand
-- does not quietly grow a size it never offered.
insert into product_variants (product_id, name, unit_price_cents, sort_order)
select p.id, '8" - 3 layers', 0, 4
from products p
where p.slug = 'custom-cake'
	and exists (
		select 1 from product_variants v
		where v.product_id = p.id and v.name = '8" - 2 layers'
	)
on conflict (product_id, name) do nothing;
