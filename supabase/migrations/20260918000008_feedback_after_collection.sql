-- ---------------------------------------------------------------------------
-- The feedback request now waits on the button, not on the calendar.
--
-- 20260918000003 asked a day after the pickup date, and took orders in either
-- `collected` or `ready` on the grounds that she does not always come back to
-- press the last button. Ryan asked for it the other way round: a day after the
-- status is updated.
--
-- That is the better anchor, and it makes the second status unnecessary. The
-- pickup date is a thing somebody typed into a form three weeks earlier and is
-- only a guess about when the box changes hands. `collected_at` is the moment
-- she watched it happen. Asking a day after the guess means an order collected
-- late is asked about before it was picked up, or not at all; asking a day
-- after the fact is right every time.
--
-- And `ready` can go. It was a hedge against her forgetting the last button,
-- but with the clock started by that button the hedge has nothing to hang on:
-- a `ready` order has no moment to count from except the pickup date, which is
-- the guess this migration exists to stop trusting. Asking somebody how their
-- cake was when they never collected it is worse than not asking, so the rule
-- is now the one status that somebody actually saw happen.
--
-- The trade, stated plainly: an order she never marks collected is never asked
-- about. It sits in Ready in the admin where she can see it, and the button
-- that closes it says what pressing it will do.
--
-- Dropped and recreated rather than edited into 20260918000003, which by the
-- time you read this may or may not have been applied. This way runs correctly
-- either way.
-- ---------------------------------------------------------------------------

drop index if exists orders_feedback_due_idx;

-- What the nightly job asks for: the oldest collections not yet asked about.
-- Partial, because the answer is nearly always a handful of rows and the table
-- is mostly orders asked about months ago, or never collected at all.
create index orders_feedback_due_idx on orders (collected_at)
	where feedback_requested_at is null and status = 'collected';

comment on column orders.feedback_requested_at is
	'When the feedback request email was sent. Null means not asked yet; the cron only picks up nulls, and only for collected orders.';
