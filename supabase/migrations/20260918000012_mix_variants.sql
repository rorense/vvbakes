-- ---------------------------------------------------------------------------
-- Let one product be bought as several of its flavours at once.
--
-- The minis are the ask. They go out in boxes of twelve, twenty-four is the
-- smallest order, and a box is one flavour, so the ordinary order is two boxes
-- in two flavours. 20260918000005 made that possible and priced it right, but
-- the page still asks the question one flavour at a time: pick vanilla, set the
-- boxes, add, pick ube, add again. Two passes for one decision, and nothing on
-- the page says the second pass exists.
--
-- With this on, the flavour pills become a list with a number beside each one,
-- a running total under it, and one button that puts a line in the basket for
-- every flavour with a count.
--
-- A switch rather than something worked out from the data, because the data
-- says the wrong thing. Every product below has one group of variants and would
-- qualify on that alone:
--
--   cupcakes              7 flavours   a list of numbers is exactly right
--   mini-cupcakes         6 flavours   the product this was asked for
--   brochi                2 flavours   plausible, hers to decide
--   pandan-chiffon-cake   2 sizes      a size is not a thing anyone mixes
--   tiramisu-cake         4 sizes      likewise
--   mango-charlotte-cake  2 (gluten free or not)
--
-- Nobody orders half a six inch cake and half an eight. The difference is what
-- the choice *means*, which is not in the schema, so it is hers to set.
--
-- Off by default, so every product keeps the picker it has today and this
-- changes nothing until she turns it on.
--
-- Only ever read where the product has exactly one group. A product with two,
-- like the custom cake's size by layers by flavour, has no list to put numbers
-- beside: the thing being counted is a combination, and there are a hundred and
-- sixty of them.
-- ---------------------------------------------------------------------------

-- `if not exists` so the whole file is re-runnable, which the update at the
-- bottom already was. Supabase never runs a recorded version twice, so this is
-- not about production: it is what lets tests/schema.test.ts run this exact
-- file against a database that already has the column, which is the only way to
-- check the slug pattern below against the slug the live shop actually uses.
alter table products
	add column if not exists mix_variants boolean not null default false;

comment on column products.mix_variants is
	'The product page offers every flavour at once with a count beside each, instead of one at a time. Ignored unless the product has exactly one option group.';

-- On for the minis, which is the product this was asked for. The regular sized
-- cupcakes are the same shape and are one switch away in the admin, but they
-- were not what was asked and repricing how a second product is bought is not
-- something to do on an inference.
--
-- Guarded on the column still holding what the ALTER above put in it, so a
-- re-run, or an install where she has since turned it off, leaves her answer
-- alone. Matched on the slug the way 20260918000010 is, and for the same
-- reason: the live row is `mini-cupcakes`, the seeded one is
-- `cupcakes-mini-sized`.
update products
set mix_variants = true
where not mix_variants
	and slug like '%mini%'
	and slug like '%cupcake%';
