-- ---------------------------------------------------------------------------
-- The same update as 20260918000002, because that one never reached the rows.
--
-- Production says version 20260918000002 is applied, and the three products it
-- names still hold null:
--
--   biscoff-brownie  null      brochi  null      wingko  null
--
-- while its siblings did land, so this is not the note columns being unread.
-- 20260918000001's chiffon is switched off on the live site and
-- 20260918000004's cookies carry their example. The likeliest reading is a
-- version recorded for a file that was not this one: two sessions were writing
-- migrations the same afternoon and 0002 was picked twice before the numbering
-- settled. Whatever recorded it, a version already in the history is never run
-- again, so the fix is a new number rather than an edit to that file.
--
-- 20260918000002 is left exactly as it is. It is what a fresh install runs, it
-- is correct there, and rewriting an applied migration to chase a row it
-- missed would leave the two databases with different histories for no gain.
--
-- Still guarded on null, so this does nothing on a fresh install, nothing on a
-- second run, and nothing to an answer she has since typed in the admin. On the
-- shop as it stands today it is the whole of the change.
-- ---------------------------------------------------------------------------

update products
set note_placeholder = 'E.g. Can each slice be cut in half?'
where note_placeholder is null
	and (slug like '%brochi%' or slug like '%wingko%' or slug like '%biscoff%');
