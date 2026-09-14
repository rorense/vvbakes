-- ---------------------------------------------------------------------------
-- Bounces: what becomes of an email after the provider has accepted it.
--
-- `deliver` reports success the moment Resend takes the message, because that
-- is the only thing it can know while the request is still open. Whether the
-- thing arrived is decided minutes later by the receiving server, and until
-- now that verdict went nowhere. A customer who mistyped their address left
-- "Sent the order-confirmed email" sitting in the trail, the owner read it as
-- done, and the customer was never told anything at all.
--
-- Resend reports both outcomes by webhook, so the trail needs two more kinds
-- of entry. `email_bounced` is the far end refusing the message. The other is
-- worth recording for a different reason: `email_complained` is the recipient
-- marking it as spam, and enough of those stop the whole domain being
-- delivered, for every customer, not just the one who complained.
-- ---------------------------------------------------------------------------

alter table order_events drop constraint order_events_type_check;

alter table order_events
add constraint order_events_type_check check (
	type in (
		'created',
		'status_changed',
		'email_sent',
		'email_failed',
		'email_bounced',
		'email_complained',
		'note'
	)
);

-- The webhook knows the message only by Resend's own id for it, so that is how
-- the send it belongs to gets found. Without this, every bounce costs a
-- sequential scan of every event the shop has ever recorded.
create index order_events_email_id_idx on order_events ((data ->> 'emailId'));
