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
--   Cookies   2 for $5                 -> unit 250, sold in steps of 2
--   Brochi    $5 / slice               -> unit 500, label 'slice'
--   Wingko    $5 / slice               -> unit 500, label 'slice'
--   Pandan Chiffon Cake  $3 / slice    -> unit 300, label 'slice'
insert into products (
	name, slug, category_id, description,
	unit_price_cents, unit_label, qty_step, is_featured, sort_order
) values
	(
		'Cupcakes', 'cupcakes',
		(select id from categories where slug = 'cupcakes'),
		null, 300, 'each', 1, true, 1
	),
	(
		'Cookies', 'cookies',
		(select id from categories where slug = 'cookies'),
		null, 250, 'each', 2, true, 2
	),
	(
		'Brochi', 'brochi',
		(select id from categories where slug = 'cakes-and-kue'),
		null, 500, 'slice', 1, false, 3
	),
	(
		'Wingko', 'wingko',
		(select id from categories where slug = 'cakes-and-kue'),
		null, 500, 'slice', 1, false, 4
	),
	(
		'Pandan Chiffon Cake', 'pandan-chiffon-cake',
		(select id from categories where slug = 'cakes-and-kue'),
		null, 300, 'slice', 1, true, 5
	)
on conflict (slug) do nothing;

insert into product_price_tiers (product_id, qty, price_cents)
values ((select id from products where slug = 'cupcakes'), 4, 1200)
on conflict (product_id, qty) do nothing;

-- ---------------------------------------------------------------------------
-- After creating the owner's user in the Supabase dashboard
-- (Authentication > Users > Add user), run this once with their id:
--
--   insert into admins (user_id) values ('00000000-0000-0000-0000-000000000000');
--
-- Then turn off public sign-ups: Authentication > Sign In / Providers >
-- "Allow new users to sign up" off.
-- ---------------------------------------------------------------------------
