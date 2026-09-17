-- ---------------------------------------------------------------------------
-- Asking, once, how it went.
--
-- The shop has `reviews` already, but that table is a list she types out in the
-- admin: her transcription of something said on Instagram or over a counter.
-- Nothing has ever asked the customer directly, and nothing has ever recorded
-- that they agreed to be quoted. This is both of those.
--
-- Two tables' worth of thing, kept deliberately apart:
--
--   `feedback`            what the customer actually wrote. Private. Never read
--                         by a public page, whatever the consent box says.
--   `reviews`            what is on the website, in her order, in her words.
--
-- Publishing is a copy from the first into the second, made by hand, by her.
-- There is no path from a form submission to a public page, which is the whole
-- point: a consent tick is permission to be asked, not permission to publish
-- unread. See app/admin/(dashboard)/feedback for the copy.
--
-- `consented` is stored rather than enforced, because both answers are worth
-- keeping. A "no" is still feedback she wants to read; it is only ineligible
-- for the website, and the admin is what refuses to publish it.
-- ---------------------------------------------------------------------------

-- When the request went out. Null is "not asked yet" and is what the cron looks
-- for, so an order can only ever be asked once however often the job runs.
-- Stamped whether or not the send succeeded: a bounced feedback request is not
-- worth chasing, and retrying every night for seven years is worse than
-- missing one. The failure is in `order_events` either way.
alter table orders add column feedback_requested_at timestamptz;

comment on column orders.feedback_requested_at is
	'When the feedback request email was sent. Null means not asked yet; the cron only picks up nulls.';

-- What the cron asks for every night: the oldest orders past their date that
-- have not been asked. Partial, because the answer is nearly always no rows and
-- the table is mostly orders that were asked months ago.
create index orders_feedback_due_idx on orders (pickup_date)
	where feedback_requested_at is null and status in ('collected', 'ready');

create table feedback (
	id uuid primary key default gen_random_uuid(),
	-- One per order. The form is reached from one email, and a second submission
	-- is someone changing their mind rather than a second opinion, so the upsert
	-- in submitFeedback overwrites rather than adding a row.
	order_id uuid not null unique references orders (id) on delete cascade,
	-- Their name as they chose to give it, which is not always the name on the
	-- order: the form says this one may end up on the website, and people
	-- shorten it. Same ceiling as `reviews.author`, because that is where it
	-- goes if she publishes it.
	author text not null check (length(btrim(author)) between 1 and 80),
	body text not null check (length(btrim(body)) between 1 and 800),
	-- They ticked the box that says this may be quoted on the website, with the
	-- name above it. False is the default and the form's default.
	consented boolean not null default false,
	-- When she copied it onto the website. A record of the act, not a live link
	-- to a row: saving settings replaces every review wholesale, so a foreign
	-- key here would be dangling or wrong within a week. Taking it back down is
	-- done in settings, where the reviews live.
	published_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- The admin lists newest first and nothing else queries this.
create index feedback_created_idx on feedback (created_at desc);

create trigger feedback_set_updated_at before update on feedback
	for each row execute function set_updated_at();

alter table feedback enable row level security;

-- Shaped like `orders`, not like `reviews`: no public read at any point, and no
-- insert policy for anybody. A submission goes through the service role from
-- the server, which is also what keeps a leaked anon key from reading what
-- customers said about her.
create policy "admin read" on feedback for select to authenticated using (is_admin());
create policy "admin update" on feedback for update to authenticated
	using (is_admin()) with check (is_admin());
create policy "admin delete" on feedback for delete to authenticated using (is_admin());

-- The trail gains one more kind of entry, the same way the bounce webhook did.
-- A feedback request already shows up as `email_sent`; this is the answer
-- coming back, which is the half that happens without her doing anything and is
-- therefore the half worth being able to find on the order.
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
		'feedback_received',
		'note'
	)
);
