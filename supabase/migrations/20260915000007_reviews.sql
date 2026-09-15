-- ---------------------------------------------------------------------------
-- What customers said afterwards.
--
-- Shaped like faqs and for the same reason: a list the owner writes, in her own
-- admin, without a deploy. Ordered, length-checked per row, public read and
-- admin write, replaced wholesale on save.
--
-- Deliberately seeded with nothing. Every other table here ships placeholder
-- content so a fresh clone looks like a bakery, but a placeholder review is a
-- sentence attributed to a person who never said it, sitting on a public page
-- under a real business's name. There is no version of that which is only a
-- placeholder. The home page hides the band while the table is empty, so the
-- site is complete without them and gains a section the moment a real one is
-- typed in.
--
-- `detail` is the line under the name: "Wedding cake, March", a suburb, the
-- occasion. Optional, because plenty of reviews are just a name.
-- ---------------------------------------------------------------------------

create table reviews (
	id uuid primary key default gen_random_uuid(),
	author text not null check (length(btrim(author)) between 1 and 80),
	body text not null check (length(btrim(body)) between 1 and 800),
	detail text check (detail is null or length(btrim(detail)) between 1 and 120),
	sort_order int not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index reviews_sort_idx on reviews (sort_order);

create trigger reviews_set_updated_at before update on reviews
	for each row execute function set_updated_at();

alter table reviews enable row level security;

create policy "public read" on reviews for select using (true);
create policy "admin all" on reviews for all to authenticated
	using (is_admin()) with check (is_admin());
