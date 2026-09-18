-- ---------------------------------------------------------------------------
-- The caveat under the custom cake's price guide, in her words rather than ours.
--
-- 20260917000001 seeded it as "Custom designs and premium flavours may cost
-- extra." She wrote "Custom designs & premium flavours may incur extra costs",
-- and the difference is not only the ampersand: "may cost extra" reads as the
-- price moving a little, "may incur extra costs" reads as there being more to
-- pay, which is the thing she is actually warning about on a page where every
-- number above it says "from".
--
-- Guarded on the note still being exactly what that migration wrote, so a shop
-- where she has already reworded it in the admin keeps her wording, and a
-- re-run does nothing. Nothing else reads this column; it is one line of prose
-- under a table.
-- ---------------------------------------------------------------------------

update products
set price_guide_note = 'Custom designs & premium flavours may incur extra costs'
where slug = 'custom-cake'
	and price_guide_note = 'Custom designs and premium flavours may cost extra.';
