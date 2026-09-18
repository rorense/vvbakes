-- ---------------------------------------------------------------------------
-- Delivery that costs something, without saying yet what it costs.
--
-- The client asked for this in so many words: "Delivery is available for an
-- additional fee, depending on your location and how far you are from Flat
-- Bush. When you place your order, include your address and I'll confirm the
-- delivery fee with you." The terms page carried that sentence briefly and it
-- was taken back out, correctly: the order form charges the flat
-- `delivery_fee_cents`, which is 0 on the live shop, so the page promised a
-- variable fee while the form beside it said "Free" and the total agreed with
-- the form. One of the two had to move, and a page that lies about money is the
-- wrong one to leave standing.
--
-- So the fee grows a third state. It was two:
--
--   delivery_enabled = false   no delivery, no clause, no option
--   delivery_fee_cents = N     N is added to the total when they choose it,
--                              and 0 of those means free, which is a real
--                              answer some shops want
--
-- and the missing one is "there is a fee and it depends on where you are". A
-- number cannot say that. A nullable `delivery_fee_cents` could, but it is read
-- by `place_order` in every migration since 20260911000003, restated verbatim
-- each time, and rewriting that function to fix a sentence is the tail wagging
-- the dog.
--
--   site_settings.delivery_fee_on_request   the fee is quoted by hand
--
-- What it does NOT do is change what anybody is charged. The fee stays 0 and
-- `place_order` goes on reading the column it always read, so the order arrives
-- at the subtotal of its lines. She then puts the delivery charge into the
-- quote when she confirms, which is the same field she already uses for a
-- custom cake's price, on the same screen, at the same moment. That is why this
-- is a flag beside the fee rather than a second money column: there is no
-- second number to store, only a number she does not have yet.
--
-- The check constraint is the point of the pair. Without it the two can drift,
-- and a shop set to "I'll confirm the fee" with 800 still in the column would
-- quietly charge eight dollars behind a sentence promising to tell you first.
-- The admin forces the zero on save as well; this is what holds for a row
-- edited straight in Supabase.
--
-- Off by default, so a shop that means free delivery goes on saying free
-- delivery and nothing about this reaches it.
-- ---------------------------------------------------------------------------

-- `if not exists` so the file is re-runnable against a database that already
-- has the column, which is what lets tests/schema.test.ts apply it twice.
alter table site_settings
	add column if not exists delivery_fee_on_request boolean not null default false;

comment on column site_settings.delivery_fee_on_request is
	'The delivery fee depends on the address and is confirmed by hand after the order. Nothing is charged for delivery at checkout; the fee goes into the quote. Requires delivery_fee_cents to be 0.';

-- Named, so a re-run can drop and recreate it rather than piling up anonymous
-- copies of the same rule.
alter table site_settings
	drop constraint if exists site_settings_delivery_fee_on_request_is_free;

alter table site_settings
	add constraint site_settings_delivery_fee_on_request_is_free
		check (not delivery_fee_on_request or delivery_fee_cents = 0);

-- --- the one this was asked for --------------------------------------------
--
-- Her shop, which is the row this was written for: delivery is on, the fee is
-- 0, and 0 there has never meant free. It meant "not decided", and the site
-- read it as free because that is the only thing a zero could say.
--
-- Guarded on all three, so it does nothing on a shop that has delivery switched
-- off, nothing on one charging a real fee, and nothing on a re-run or on an
-- install where she has since turned it back off herself. A fresh install has
-- delivery off and is untouched.
update site_settings
set delivery_fee_on_request = true
where id = 1
	and delivery_enabled
	and delivery_fee_cents = 0
	and not delivery_fee_on_request;
