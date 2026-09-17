-- ---------------------------------------------------------------------------
-- The note box is hers: whether it is asked for at all, and in what words.
--
-- Every product page has always ended in "Anything to add?", worded once in
-- components/order/BriefFields.tsx and therefore worded the same on a box of
-- cookies and on a whole chiffon cake. Two things came out of that:
--
--   * The chiffon does not want the question. It comes how it comes, and a box
--     inviting "writing on top, a colour" invites a request she then has to
--     turn down.
--   * The tiramisu wants the question with its own example. "No chocolate
--     ganache please" is the thing people actually ask her for, and it is the
--     thing nobody asks about a cookie.
--
-- So three columns rather than a third and fourth rewording of one string. The
-- wording has already been through three passes; the next one should not need a
-- deploy.
--
--   wants_note        ask the question on this product at all
--   note_hint         the grey line under the label, in her words
--   note_placeholder  the example inside the empty box, in her words
--
-- The two text columns are null by default and null means "say what the code
-- says", which keeps one good default for the thirty products she has not
-- thought about rather than thirty copies of it in the table.
--
-- `wants_note` defaults true, unlike the switches beside it, because the
-- question has been asked on every product since the shop opened and a column
-- added today must not be the thing that silently stops asking it. lib/mappers
-- reads a missing column as true for the same reason: the app is deployed
-- before the migration is applied, and for those few minutes the row comes back
-- without it.
--
-- Nothing here touches `order_items`. A note already placed is snapshotted on
-- the line that carries it, and switching the question off tomorrow does not
-- un-ask it of the person who answered it last week.
-- ---------------------------------------------------------------------------

alter table products
	add column wants_note boolean not null default true,
	-- 500 rather than the note's own 1000: these are one line of guidance and
	-- one line of example. The longest wording in the code today is the custom
	-- cake's, at a little over 370, so there is room to move that in here too if
	-- she ever wants to edit it herself.
	add column note_hint text
		check (note_hint is null or length(btrim(note_hint)) between 1 and 500),
	add column note_placeholder text
		check (note_placeholder is null or length(btrim(note_placeholder)) between 1 and 500);

comment on column products.wants_note is
	'The product page asks "Anything to add?" at all. On for everything unless she turns it off.';

comment on column products.note_hint is
	'The line under the note box, in her words. Null uses the wording in BriefFields.';

comment on column products.note_placeholder is
	'The example inside the empty note box, in her words. Null uses the wording in BriefFields.';

-- --- the two products this was asked for ------------------------------------
--
-- These two are for an install that already has the products: the shop as it
-- is running today. They do nothing at all on a fresh one, because migrations
-- run before the seed and there is no row here yet to update. supabase/seed.sql
-- carries the chiffon's answer for that case, which is the arrangement
-- 20260916000004_custom_flavour.sql already landed on and the comment above the
-- seed's insert explains.
--
-- Matched on a fragment of the slug rather than on the name. The chiffon is
-- seeded as 'pandan-chiffon-cake' but she may well have renamed it, and the
-- tiramisu is not in this repo at all — it was added through the admin, so its
-- slug is whatever she typed.
--
-- Each is guarded by the column still holding what the ALTER above just put in
-- it, so a re-run, or an install where she got there first through the admin,
-- leaves her answer alone rather than putting this one back.

update products
set wants_note = false
where slug like '%chiffon%' and wants_note;

update products
set note_placeholder = 'E.g. No chocolate ganache please'
where slug like '%tiramisu%' and note_placeholder is null;
