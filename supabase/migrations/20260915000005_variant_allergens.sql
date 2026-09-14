-- ---------------------------------------------------------------------------
-- Allergens on a variant.
--
-- A cake is chocolate, carrot or red velvet. All three have gluten, dairy and
-- egg in them; only the carrot one has walnuts. Until now the allergen list
-- belonged to the product, so the walnuts either went unsaid or were declared
-- on all three, and neither is the truth.
--
-- The product's list stays, and stays the floor: it is what is in every version
-- of this thing. A variant's list is what that one adds on top. It is not an
-- override, and an empty variant list is not "inherits" — it means this variant
-- adds nothing, which is the same answer either way. That asymmetry is
-- deliberate. Under-declaring an allergen is the failure that puts someone in
-- hospital, so the model is the one where the shared allergens cannot go
-- missing from a flavour because a box went unticked on a phone.
--
-- Nothing here enforces the relationship; it is a display rule, applied in
-- lib/allergens.ts and mirrored nowhere else. The column is just a list.
-- ---------------------------------------------------------------------------

alter table product_variants
	add column allergens text[] not null default '{}';

comment on column product_variants.allergens is
	'What this variant adds to the product''s allergens, not a replacement for them.';
