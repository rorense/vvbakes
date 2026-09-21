-- ---------------------------------------------------------------------------
-- The owner correcting an order's details, in the trail.
--
-- Customers mistype. A pickup date a day out, an email with the domain wrong,
-- a phone number missing a digit: every one of those arrives as a fact about
-- the order that is simply not true, and until now the only way to fix one was
-- in the Supabase table editor. So the admin order page gains a form, and the
-- trail gains the entry that form writes.
--
-- The entry carries what changed, as `{ changes: { pickup_date: { from, to } } }`.
-- Before and after, both, because the whole point of editing an order is that
-- the thing being overwritten was what the customer typed, and a log that
-- keeps only the correction cannot answer "what did they actually ask for".
--
-- Same shape of change as 20260915000001 and 20260918000003 before it: drop
-- the check, put it back with one more name in it.
-- ---------------------------------------------------------------------------

alter table order_events drop constraint order_events_type_check;

alter table order_events
add constraint order_events_type_check check (
	type in (
		'created',
		'status_changed',
		'details_edited',
		'email_sent',
		'email_failed',
		'email_bounced',
		'email_complained',
		'feedback_received',
		'note'
	)
);
