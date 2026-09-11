-- ---------------------------------------------------------------------------
-- Tighten who may call the reorder functions.
--
-- The previous migration revoked execute from PUBLIC and granted it to
-- `authenticated`, which read as "signed-in users only" and was not. Supabase
-- grants execute on every new function in this schema directly to `anon` as
-- well, and a grant made to a role is not undone by revoking from PUBLIC. An
-- anonymous caller could therefore invoke these.
--
-- Nothing was exposed by that: both functions are `security invoker`, so row
-- level security applied as the caller, and anon has no update policy on either
-- table, so the call changed nothing. But the grant should say what it means,
-- and `place_order` already sets the pattern of naming the roles explicitly.
-- ---------------------------------------------------------------------------

revoke execute on function reorder_products(uuid[]) from public, anon;
grant execute on function reorder_products(uuid[]) to authenticated;

revoke execute on function reorder_categories(uuid[]) from public, anon;
grant execute on function reorder_categories(uuid[]) to authenticated;
