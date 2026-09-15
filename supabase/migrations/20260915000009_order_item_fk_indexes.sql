-- ---------------------------------------------------------------------------
-- The two foreign keys on order_items that had no index behind them.
--
-- Postgres indexes the referenced side of a foreign key automatically, because
-- that side is a primary key. It does not index the referencing side, and both
-- of these are `on delete set null`: every time a product or a variant is
-- deleted, Postgres has to find the order_items pointing at it, and with no
-- index that is a sequential scan of the whole order history.
--
-- Today that history is small enough that nobody would notice. It only grows,
-- deletes take a row lock while they run, and the fix is two lines.
--
-- `concurrently` is deliberately not used: these run inside the migration's
-- transaction, which `create index concurrently` is not allowed to do, and on a
-- table this size the brief write lock is not worth splitting the migration up
-- to avoid.
-- ---------------------------------------------------------------------------

create index if not exists order_items_product_idx on order_items (product_id);

create index if not exists order_items_product_variant_idx on order_items (product_variant_id);
