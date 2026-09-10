-- ---------------------------------------------------------------------------
-- Row level security.
--
-- The shape of it:
--   * The catalogue, public settings and the availability calendar are world
--     readable. They are what the site renders for anonymous visitors.
--   * The owner (a row in `admins`) can do anything to those, plus the private
--     settings.
--   * `orders`, `order_items` and `order_events` are never readable by anon and
--     have no insert policy for anyone. Orders are created solely through the
--     `place_order` function called with the service role from the server, and
--     the public status page reads a single order by token, also server-side.
--     A leaked anon key therefore exposes the menu and nothing else.
-- ---------------------------------------------------------------------------

create or replace function is_admin() returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
	select exists (select 1 from admins where user_id = auth.uid());
$fn$;

revoke execute on function is_admin() from public;
grant execute on function is_admin() to anon, authenticated;

alter table admins enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table product_price_tiers enable row level security;
alter table site_settings enable row level security;
alter table site_settings_private enable row level security;
alter table availability_rules enable row level security;
alter table availability_overrides enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_events enable row level security;

-- `admins` intentionally has no policies at all. It is managed from the Supabase
-- SQL editor or with the service role, and is_admin() reads it as security
-- definer, which bypasses RLS.

-- --- public reads ----------------------------------------------------------

create policy "public read" on categories for select using (true);
create policy "public read" on products for select using (true);
create policy "public read" on product_price_tiers for select using (true);
create policy "public read" on site_settings for select using (true);
create policy "public read" on availability_rules for select using (true);
create policy "public read" on availability_overrides for select using (true);

-- --- owner writes ----------------------------------------------------------

create policy "admin all" on categories for all to authenticated
	using (is_admin()) with check (is_admin());
create policy "admin all" on products for all to authenticated
	using (is_admin()) with check (is_admin());
create policy "admin all" on product_price_tiers for all to authenticated
	using (is_admin()) with check (is_admin());
create policy "admin all" on site_settings for all to authenticated
	using (is_admin()) with check (is_admin());
create policy "admin all" on site_settings_private for all to authenticated
	using (is_admin()) with check (is_admin());
create policy "admin all" on availability_rules for all to authenticated
	using (is_admin()) with check (is_admin());
create policy "admin all" on availability_overrides for all to authenticated
	using (is_admin()) with check (is_admin());

-- --- orders ----------------------------------------------------------------
-- Deliberately no insert policy. See the note at the top of this file.

create policy "admin read" on orders for select to authenticated using (is_admin());
create policy "admin update" on orders for update to authenticated
	using (is_admin()) with check (is_admin());
create policy "admin delete" on orders for delete to authenticated using (is_admin());

create policy "admin read" on order_items for select to authenticated using (is_admin());

create policy "admin read" on order_events for select to authenticated using (is_admin());
create policy "admin insert" on order_events for insert to authenticated with check (is_admin());
