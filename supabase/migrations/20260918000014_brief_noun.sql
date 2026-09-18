-- ---------------------------------------------------------------------------
-- What the questions on a product page call the thing being ordered.
--
-- The brief and the custom flavour questions were written for the custom cake
-- and say "cake" in three places a customer reads:
--
--   the legend     "Custom cake flavour"
--   the frosting   "If coloured frosting for decorating the cake is required"
--   the note hint  "I don't do writing on cakes, please request a personalised
--                   cake topper"
--
-- On the cupcakes every one of those is the wrong noun. The first is the worse
-- of the three: the screenshots asked for "Custom cupcake flavour" and what
-- shipped in 8f5f710 was "Custom cake flavour", so that question has been
-- asking about the wrong thing since the day it was reworded.
--
-- A column rather than a category check in the code, for the reason the three
-- wording columns before it are columns. What a product should be called in its
-- own questions is hers, it is one word, and the next product that is neither a
-- cake nor a cupcake should not need a deploy to be asked about properly.
--
-- Singular, and pluralised with an s where the sentence needs it. That holds
-- for cake, cupcake, cookie, brownie and slice, which is the whole menu; a word
-- it does not hold for is a reason to widen this, not to spell the plural out
-- on every row.
--
-- Null means "cake", which is what every one of these sentences says today, so
-- nothing changes for any product she does not set.
-- ---------------------------------------------------------------------------

alter table products
	add column if not exists brief_noun text
		check (brief_noun is null or length(btrim(brief_noun)) between 1 and 40);

comment on column products.brief_noun is
	'What the brief and flavour questions call this, singular. Null says "cake".';

-- The cupcakes, both sizes, which is what this was asked for. Matched on the
-- slug the way 20260918000009 is: the live rows are `cupcakes` and
-- `mini-cupcakes` and the seeded one is `cupcakes-mini-sized`.
--
-- "cupcake" rather than "cup cake", to match what her own products are called
-- and what the category and the rest of the shop say. It is one edit in the
-- admin if she wants it the other way, which is most of the reason this is a
-- column.
update products
set brief_noun = 'cupcake'
where brief_noun is null
	and slug like '%cupcake%';
