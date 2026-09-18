-- ---------------------------------------------------------------------------
-- Her own wording on the two cupcake products: the example inside the note box,
-- and the line under the photo picker.
--
-- Both columns exist and both are still null on the live shop, so the pages are
-- showing the code's defaults. The defaults are written for a custom cake and
-- say so:
--
--   note box    "e.g. The cake is for my mum's 50th birthday ... The cake needs
--                to feed 20 people ..."
--   photos      "A cake you've seen and loved, the colour, design, etc."
--
-- Neither is wrong on a cake and neither is right on a box of cupcakes. Someone
-- ordering minis for a gender reveal is not describing one cake for twenty
-- people, and is not sending a picture of a cake.
--
-- Both products, not just the minis. The ask covered the regular sized and the
-- minis together, and the two share a page layout, a brief and a photo picker,
-- so wording that suits one suits the other.
--
-- Matched on a fragment of the slug rather than on the name, the way
-- 20260918000001 matched the chiffon. The live rows are `cupcakes` and
-- `mini-cupcakes`; supabase/seed.sql calls the second one
-- `cupcakes-mini-sized`, and `%cupcake%` is the only pattern that catches all
-- three and nothing else in either database.
--
-- Guarded on null, so this does nothing on a second run and nothing to an
-- answer she has since typed into the admin. It is hers to reword there; this
-- is only the starting text she asked for.
-- ---------------------------------------------------------------------------

update products
set note_placeholder =
	'E.g. Cupcakes are for a gender reveal party, make half the order with pastel pink coloured vanilla buttercream, and the other half with pastel blue coloured vanilla buttercream in a rosette design as shown in the inspo picture.'
where note_placeholder is null
	and slug like '%cupcake%';

-- The default with its first three words changed, because the rest of it is
-- already what she wants said: be specific in the notes about what you want
-- from each picture.
update products
set inspiration_hint =
	'Cupcakes you''ve seen and loved, the colour, design, etc. Please be specific in the notes section to say what exactly you want from each picture.'
where inspiration_hint is null
	and slug like '%cupcake%';
