-- ---------------------------------------------------------------------------
-- Starting data.
--
-- Everything here is either structural (the seven weekday rows, the two
-- single-row settings tables) or a straight transcription of the printed market
-- menu. It is safe to re-run: every insert is idempotent.
--
-- Deliberately NOT seeded: bank account details, the pickup street address and
-- the notification email. Those are private and belong in /admin/settings, not
-- in a file that lives in a public git repository.
--
-- The pickup days, capacity, lead time and cut-off below are placeholders until
-- the owner sets her real ones.
-- ---------------------------------------------------------------------------

insert into site_settings (id, about_text, pickup_window_text, pickup_suburb)
values (
	1,
	'Hi, I''m the baker behind vvbakes. Everything is made in small batches, to order, in my own kitchen, cupcakes and cookies alongside the Indonesian cakes I grew up with.',
	'Pickups 4–7pm',
	'Auckland'
)
on conflict (id) do nothing;

insert into site_settings_private (id) values (1)
on conflict (id) do nothing;

-- Placeholder: open Friday and Saturday, five orders a day.
insert into availability_rules (weekday, is_open, capacity) values
	(0, false, 0),
	(1, false, 0),
	(2, false, 0),
	(3, false, 0),
	(4, false, 0),
	(5, true, 5),
	(6, true, 5)
on conflict (weekday) do nothing;

insert into categories (name, slug, accent, sort_order) values
	('Cupcakes', 'cupcakes', 'mint', 1),
	('Cookies', 'cookies', 'butter', 2),
	('Cakes & kue', 'cakes-and-kue', 'rose', 3)
on conflict (slug) do nothing;

-- Prices transcribed exactly from the market menu:
--   Cupcakes  $3 each / 4 for $12      -> unit 300, tier 4 -> 1200
--   Cookies   $5 a pack of two         -> unit 500, label 'pack'
--   Brochi    $5 / slice               -> unit 500, label 'slice'
--   Wingko    $5 / slice               -> unit 500, label 'slice'
--   Pandan Chiffon Cake  $3 / slice    -> unit 300, label 'slice'
--
-- The cupcakes ask two questions nothing else here does: a flavour of your own
-- and what the frosting should be, plus somewhere to put the picture it came
-- from. 20260916000004_custom_flavour.sql switches the same two columns on for
-- the whole cupcakes category, which is what a project seeded before that
-- migration existed needs; this is what a project seeded after it needs, since
-- migrations run before the seed and that update has no rows to find.
--
-- `wants_note` is here for exactly that reason and no other. It defaults true,
-- so four of the five could leave it out; the chiffon could not, because
-- 20260918000001_product_note.sql turns it off with an update that runs before
-- this insert creates the row it is looking for. Written out on all five rather
-- than only on the one, so the column reads as a decision made per product
-- instead of as one row with something odd about it.
--
-- `note_placeholder` is here for the same reason, and for three migrations
-- rather than one. 20260918000002_slice_note_example.sql puts her own example
-- inside the note box on the things sold by the slice,
-- 20260918000004_cookie_note_placeholder.sql does it for the cookies, and
-- 20260918000009_cupcake_wording.sql does it for the cupcakes; on a fresh
-- install all three run before there is a row to put it in. Null on the chiffon
-- means "say what BriefFields says", which is the right answer for almost
-- everything and the reason that wording is not copied out here.
--
-- `inspiration_hint` is the last column for the same reason again, and is the
-- one only the cupcakes need. The default in InspirationPicker talks about a
-- cake, which is right on the custom cake and wrong on a box of cupcakes; the
-- other four here do not ask for photos at all, so null is not a decision they
-- are making.
insert into products (
	name, slug, category_id, description,
	unit_price_cents, unit_label, qty_step, is_featured, sort_order,
	wants_custom_flavour, wants_brief, wants_note, note_placeholder, inspiration_hint,
	-- `brief_noun` last, and only the cupcakes set it: the questions say "cake"
	-- otherwise, which is right on the three sold by the slice and wrong on a
	-- box of cupcakes. 20260918000014_brief_noun.sql does the same to a shop
	-- that already has these rows.
	brief_noun
) values
	(
		'Cupcakes', 'cupcakes',
		(select id from categories where slug = 'cupcakes'),
		null, 300, 'each', 1, true, 1,
		true, true, true,
		'E.g. Cupcakes are for a gender reveal party, make half the order with pastel pink coloured vanilla buttercream, and the other half with pastel blue coloured vanilla buttercream in a rosette design as shown in the inspo picture.',
		'Cupcakes you''ve seen and loved, the colour, design, etc. Please be specific in the notes section to say what exactly you want from each picture.',
		'cupcake'
	),
	(
		'Cookies', 'cookies',
		(select id from categories where slug = 'cookies'),
		'Each pack comes with two cookies.', 500, 'pack', 1, true, 2,
		false, false, true,
		'E.g. Please don''t add any flaky salt', null, null
	),
	(
		'Brochi', 'brochi',
		(select id from categories where slug = 'cakes-and-kue'),
		null, 500, 'slice', 1, false, 3,
		false, false, true,
		'E.g. Can each slice be cut in half?', null, null
	),
	(
		'Wingko', 'wingko',
		(select id from categories where slug = 'cakes-and-kue'),
		null, 500, 'slice', 1, false, 4,
		false, false, true,
		'E.g. Can each slice be cut in half?', null, null
	),
	(
		-- It comes how it comes. A box inviting writing on top only invites a
		-- request she then has to turn down.
		'Pandan Chiffon Cake', 'pandan-chiffon-cake',
		(select id from categories where slug = 'cakes-and-kue'),
		null, 300, 'slice', 1, true, 5,
		false, false, false, null, null, null
	)
on conflict (slug) do nothing;

insert into product_price_tiers (product_id, qty, price_cents)
values ((select id from products where slug = 'cupcakes'), 4, 1200)
on conflict (product_id, qty) do nothing;

-- The minis, which are the worked example for the column 20260918000005 adds.
-- A separate insert rather than a sixth row above, because it is the only
-- product here that is priced this way and the three columns that say so would
-- be null on all five of the others.
--
--   Minis  $17.50 a box of 12, two boxes minimum, $15 a box after that
--     -> unit 1750, min_per_order 2, extra_unit_price_cents 1500
--
-- which comes to $35, $50, $65, $80 and keeps going, where the bundle tiers it
-- replaces stopped at six boxes. The minimum is counted across the flavours, so
-- twenty-four minis is two boxes of twelve in two flavours if that is what they
-- want, and both boxes are charged the first-box rate.
insert into products (
	name, slug, category_id, description,
	unit_price_cents, unit_label, qty_step, min_per_order, extra_unit_price_cents,
	is_featured, sort_order,
	wants_custom_flavour, wants_brief, wants_note, mix_variants,
	note_placeholder, inspiration_hint, brief_noun
) values (
	'Cupcakes - mini sized', 'cupcakes-mini-sized',
	(select id from categories where slug = 'cupcakes'),
	'Freshly baked mini cupcakes in a delicious variety of flavours, topped with a creamy frosting and perfect for any occasion.',
	1750, 'box of 12', 1, 2, 1500,
	false, 6,
	-- `mix_variants` last of the four, and the only product here it is on for:
	-- a box is one flavour and two boxes is the smallest order, so mixing is the
	-- ordinary case rather than the exception. 20260918000012_mix_variants.sql
	-- switches it on for the shop that already has this row.
	true, true, true, true,
	-- The same two as the regular sized above, word for word, which is what
	-- 20260918000009_cupcake_wording.sql writes onto both of them on an install
	-- that already has the rows.
	'E.g. Cupcakes are for a gender reveal party, make half the order with pastel pink coloured vanilla buttercream, and the other half with pastel blue coloured vanilla buttercream in a rosette design as shown in the inspo picture.',
	'Cupcakes you''ve seen and loved, the colour, design, etc. Please be specific in the notes section to say what exactly you want from each picture.',
	'cupcake'
)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- After creating the owner's user in the Supabase dashboard
-- (Authentication > Users > Add user), run this once with their id:
--
--   insert into admins (user_id) values ('00000000-0000-0000-0000-000000000000');
--
-- Then turn off public sign-ups: Authentication > Sign In / Providers >
-- "Allow new users to sign up" off.
-- ---------------------------------------------------------------------------
