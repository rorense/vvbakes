-- ---------------------------------------------------------------------------
-- Her own example inside the note box on the cookies.
--
-- The third of these and the last of the set she asked for: 20260918000001
-- gave the box wording of its own per product and set the tiramisu's example,
-- 20260918000002 did the things sold by the slice, and this does the cookies.
-- "Please don't add any flaky salt" is the thing people actually ask about a
-- cookie, where the default offers "no sprinkles on the pink ones" — an
-- example about cupcakes, on a page that is not selling any.
--
-- Only `note_placeholder`, for the reason 20260918000002 gives: the line above
-- the box already reads "Anything I should know about this one.", which is
-- what she asked it to say, so a `note_hint` here would be a copy of the
-- default and null is how the column says the default is right.
--
-- Its own file rather than another update inside 20260918000002, which is
-- written and still pending. A migration that has already been applied is
-- never run again, so rows added to it after the fact are rows nothing ever
-- updates. Same reason that file is not part of 20260918000001.
--
-- Matched on the category rather than on slug fragments, which is where this
-- parts company with its two siblings. She asked for it on the cookies section
-- rather than on a cookie, and a cookie is not reliably called one: the shop
-- has more of them than supabase/seed.sql does, added through the admin under
-- whatever she calls them, and a nastar sits in Cookies without the word
-- appearing anywhere in its slug. The category is the thing she actually
-- pointed at.
--
-- A cookie added after this has run falls back to the shared wording until she
-- fills in "The example inside it", which is the trade for a migration that
-- runs once rather than a rule that keeps running.
--
-- Nothing here runs on a fresh install, where migrations run before the seed
-- and there is no row yet to find. supabase/seed.sql carries the same wording
-- for that case, which is the arrangement 20260918000001 already landed on.
-- ---------------------------------------------------------------------------

update products p
set note_placeholder = 'E.g. Please don''t add any flaky salt'
from categories c
where c.id = p.category_id
	-- Matched on a fragment of the category slug, not on 'cookies' exactly:
	-- that is only what the seed called it, and the category is hers to rename.
	and c.slug like '%cookie%'
	-- Guarded on the column still being null, so an answer she has typed in the
	-- admin since stays hers rather than being put back to this one, and a
	-- re-run finds nothing to do.
	and p.note_placeholder is null
	-- A product made to a brief reads the other half of NOTE_COPY, where the
	-- example is the whole worked paragraph about a 50th birthday. Personalised
	-- cookies are made to a brief and sit in this category; writing this over
	-- that paragraph would answer a much bigger question with a line about salt.
	-- The two siblings need no such guard, because nothing sold by the slice is.
	and not p.wants_brief;
