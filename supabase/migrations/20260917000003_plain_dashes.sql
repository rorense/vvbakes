-- ---------------------------------------------------------------------------
-- The price guide punctuates its sizes the way the picker already does.
--
-- 20260917000001 seeded the guide with an em dash, `6" 2 layers` joined by one.
-- The size picker on the live product does not: the owner had already written
-- those options herself, with a plain hyphen, before any of this landed. So the
-- page carried both, a few centimetres apart, saying the same thing two ways.
--
-- The hyphen wins. It is hers, it is what she will type into the admin next
-- time, and a label nobody can reproduce from a keyboard is a label that drifts
-- the first time it is edited.
--
-- Two tables, for two different reasons:
--
--   product_price_guide   the four labels seeded with an em dash, which is what
--                         production is actually showing right now
--   product_variants      the four sizes 20260917000002 would create, which
--                         matched nothing on production (she had renamed them
--                         already) but do get created on a fresh clone
--
-- Guarded the same way that migration was: by the old name, so a row she has
-- since reworded is left alone, and by the new name not already being taken,
-- because both tables are unique on it and a half-applied migration must not be
-- a failed one. Re-runnable, and a no-op wherever someone got there first.
-- ---------------------------------------------------------------------------

update product_price_guide g
set label = replace(g.label, ' ' || chr(8212) || ' ', ' - ')
from products p
where p.id = g.product_id
	and p.slug = 'custom-cake'
	and g.label like '%' || chr(8212) || '%'
	and not exists (
		select 1 from product_price_guide taken
		where taken.product_id = g.product_id
			and taken.label = replace(g.label, ' ' || chr(8212) || ' ', ' - ')
	);

update product_variants v
set name = replace(v.name, ' ' || chr(8212) || ' ', ' - ')
from products p
where p.id = v.product_id
	and p.slug = 'custom-cake'
	and v.name like '%' || chr(8212) || '%'
	and not exists (
		select 1 from product_variants taken
		where taken.product_id = v.product_id
			and taken.name = replace(v.name, ' ' || chr(8212) || ' ', ' - ')
	);
