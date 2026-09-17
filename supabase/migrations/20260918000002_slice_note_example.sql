-- ---------------------------------------------------------------------------
-- Her own example inside the note box on the things sold by the slice.
--
-- 20260918000001 gave the note box wording of its own per product and set the
-- tiramisu's example. This is the same job for the Brochi, the Wingko and the
-- Biscoff brownie, which she asked for together: "Can each slice be cut in
-- half?" is what people ask about a tray cut into slices, and it is a question
-- nobody has about a box of cupcakes. The default example offers "no sprinkles
-- on the pink ones", which on a slice invites a request that was never on.
--
-- Only `note_placeholder`. The line above the box already reads "Anything I
-- should know about this one.", which is what she asked it to say, so a
-- `note_hint` here would be a copy of the default, and null is how the column
-- says "the default is right" without keeping a second copy of it.
--
-- The chiffon is sold by the slice too and is deliberately not here: its
-- question is switched off, and an example inside a box nobody is shown is not
-- an answer to anything.
--
-- Its own file rather than another update inside 20260918000001, which is
-- committed and still pending. A migration that has already been applied is
-- never run again, so rows added to it after the fact are rows nothing ever
-- updates.
--
-- Matched on a fragment of the slug rather than on the name, for the reason
-- 20260918000001 gives: the Biscoff brownie is not in this repo at all, it was
-- added through the admin, so its slug is whatever she typed.
--
-- Guarded on the column still being null, so an answer she has typed in the
-- admin since stays hers rather than being put back to this one.
--
-- Nothing here runs on a fresh install, where migrations run before the seed
-- and there is no row yet to find. supabase/seed.sql carries the same wording
-- for that case, which is the arrangement 20260918000001 already landed on.
-- ---------------------------------------------------------------------------

update products
set note_placeholder = 'E.g. Can each slice be cut in half?'
where note_placeholder is null
	and (slug like '%brochi%' or slug like '%wingko%' or slug like '%biscoff%');
