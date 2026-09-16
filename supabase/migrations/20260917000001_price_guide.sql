-- ---------------------------------------------------------------------------
-- A product priced on request gets to say where its prices start.
--
-- "Price on request" is honest and it is also a wall. Someone deciding whether
-- to ask about a birthday cake has no idea whether the answer is forty dollars
-- or four hundred, so a good share of them never ask — and the ones who do ask
-- are the ones a number would have put off. The owner asked for the sizes she
-- makes most to carry a starting price, which is the shape every bakery's
-- "from $45" line has: enough to know whether to keep reading, not a quote.
--
-- It is a guide and nothing else. No basket reads it, `place_order` does not
-- know it exists, and a line priced on request still totals zero until she
-- quotes it. That is deliberate: the moment one of these numbers could be
-- charged, it stops being "from" and starts being a promise about a cake
-- nobody has described yet.
--
--   product_price_guide   the lines: a label, a price, and which of the two
--                         kinds of line it is
--   products.price_guide_note   the caveat under them, in her words
--
-- Rows rather than a block of text because the shop already knows how to draw
-- a label-and-price table — the bundle prices are one — and because a price
-- typed into a sentence is a price nobody can be sure got updated.
-- ---------------------------------------------------------------------------

create table product_price_guide (
	id uuid primary key default gen_random_uuid(),
	product_id uuid not null references products (id) on delete cascade,
	-- What the price is for: '6" — 2 layers', 'Additional layers'. Free text
	-- because the sizes she offers are hers to name, and the shop has no opinion
	-- about inches or tiers.
	label text not null check (length(btrim(label)) between 1 and 60),
	price_cents int not null check (price_cents >= 0),
	-- Two kinds of line, which is the only structure here worth having. A
	-- starting price reads "from $45"; an addition reads "+ $10", because
	-- "additional layers from $10" says something else entirely.
	is_addition boolean not null default false,
	sort_order int not null default 0,
	-- Two lines called '8" — 3 layers' at two prices is a coin toss to whoever
	-- is reading the table.
	unique (product_id, label)
);

comment on table product_price_guide is
	'Starting prices shown on a product priced on request. A guide only: nothing prices an order from these.';
comment on column product_price_guide.is_addition is
	'Rendered as "+ $10" rather than "from $45". An add-on, not a starting point.';

create index product_price_guide_product_sort_idx
	on product_price_guide (product_id, sort_order);

alter table product_price_guide enable row level security;

create policy "public read" on product_price_guide for select using (true);
create policy "admin all" on product_price_guide for all to authenticated
	using (is_admin()) with check (is_admin());

-- The line under the table. It belongs to the product rather than to any row
-- in the guide, because what it says is true of all of them at once: the
-- design and the flavour move the price, whichever size you started from.
alter table products
	add column price_guide_note text
		check (price_guide_note is null or length(btrim(price_guide_note)) between 1 and 300);

comment on column products.price_guide_note is
	'The caveat under the price guide, in her own words. Null hides it.';

-- ---------------------------------------------------------------------------
-- The custom cake's own guide, as she gave it.
--
-- Seeded for the same reason the product was: a table nobody has filled in is
-- a feature that is switched off, and this is the one product the request was
-- about. `on conflict do nothing` on the labels and a `where` on the note, so
-- re-running this never overwrites what she has since made of either.
--
-- This finds nothing on a project that has not been seeded yet. The custom
-- cake is created by 20260916000003_custom_cake_product.sql, which runs first,
-- so in practice it is always there.
-- ---------------------------------------------------------------------------
insert into product_price_guide (product_id, label, price_cents, is_addition, sort_order)
select p.id, g.label, g.price_cents, g.is_addition, g.sort_order
from products p
cross join (values
	('6" — 2 layers', 4500, false, 1),
	('6" — 3 layers', 5500, false, 2),
	('8" — 2 layers', 6500, false, 3),
	('8" — 3 layers', 7500, false, 4),
	('Additional layers', 1000, true, 5)
) as g(label, price_cents, is_addition, sort_order)
where p.slug = 'custom-cake'
on conflict (product_id, label) do nothing;

update products
set price_guide_note = 'Custom designs and premium flavours may cost extra.'
where slug = 'custom-cake' and price_guide_note is null;
