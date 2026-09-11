-- ---------------------------------------------------------------------------
-- Reordering products and categories.
--
-- Moving a row one place up or down renumbers the whole list. Doing that from
-- the server as one UPDATE per row costs a round trip per row, and is not
-- atomic: a failure halfway through leaves the list part-renumbered, with two
-- rows claiming the same position and an order nobody chose.
--
-- These take the list of ids in their new order and renumber in a single
-- statement, so it is one round trip and all-or-nothing.
--
-- `security invoker` (the default) on purpose: row level security still applies
-- as whoever called, so the "admin all" policy is what decides whether anything
-- actually moves. Execute is granted to authenticated rather than anon because
-- there is no reason for a signed-out visitor to be able to call it at all.
-- ---------------------------------------------------------------------------

create or replace function reorder_products(p_ids uuid[])
returns void
language sql
set search_path = public
as $fn$
	update products p
	set sort_order = o.position::int
	from unnest(p_ids) with ordinality as o(id, position)
	where p.id = o.id;
$fn$;

revoke execute on function reorder_products(uuid[]) from public;
grant execute on function reorder_products(uuid[]) to authenticated;

create or replace function reorder_categories(p_ids uuid[])
returns void
language sql
set search_path = public
as $fn$
	update categories c
	set sort_order = o.position::int
	from unnest(p_ids) with ordinality as o(id, position)
	where c.id = o.id;
$fn$;

revoke execute on function reorder_categories(uuid[]) from public;
grant execute on function reorder_categories(uuid[]) to authenticated;
