-- ---------------------------------------------------------------------------
-- Asking not to be asked.
--
-- 20260918000003 gave the shop its first email that is not part of a
-- transaction. Every other one it sends is the order itself: the confirmation
-- carries the bank details, the ready email is the thing that gets someone into
-- the car. Nobody unsubscribes from those, and nobody should be offered the
-- chance to, because refusing them would mean refusing the order.
--
-- The feedback request is different. It is a favour being asked, it arrives
-- when the transaction is already over, and a customer must be able to say no
-- once and be believed. That is what this table is.
--
-- Keyed on the address rather than on the order, deliberately. Somebody who
-- says "stop sending me these" has not said it about one cake; a per-order
-- opt-out would email them again the next time they ordered, which is the exact
-- thing they asked not to happen. So the key is the person, and it outlives
-- every order they place.
--
-- What it does NOT do:
--
--   * It does not touch feedback they have already sent. They opted out of
--     being asked, not out of what they already chose to say, and pulling a
--     review off the site because its author later muted an email would be
--     inventing a request nobody made.
--   * It does not stop order emails. The unsubscribe page says so in as many
--     words, because a customer pressing a button in a mail client cannot be
--     expected to know which of a shop's emails it applies to.
-- ---------------------------------------------------------------------------

create table feedback_optouts (
	-- Normalised on the way in by `normaliseEmail`, and the check is here so a
	-- caller that forgets fails loudly rather than creating a second row for the
	-- same person in different case. 320 is the longest address RFC 5321 allows.
	email text primary key
		check (email = lower(btrim(email)) and length(email) between 3 and 320),
	-- Which order's email they pressed it from, for her own sake when somebody
	-- writes asking what happened. `on delete set null` rather than cascade: the
	-- opt-out has to outlive the order it was asked from, or deleting an old
	-- order would quietly put someone back on the list.
	order_id uuid references orders (id) on delete set null,
	-- 'link' is the page with a button on it. 'one-click' is their mail client's
	-- own unsubscribe control, which posts to us without a human seeing a page
	-- of ours at all (RFC 8058). Worth telling apart: only the second one proves
	-- the provider is reading our List-Unsubscribe header correctly.
	source text not null default 'link' check (source in ('link', 'one-click')),
	created_at timestamptz not null default now()
);

-- The admin lists these newest first. Every other read is by primary key.
create index feedback_optouts_created_idx on feedback_optouts (created_at desc);

alter table feedback_optouts enable row level security;

-- Shaped like `feedback` next door: no public read, and no insert policy for
-- anybody. An opt-out is written by the server through the service role, from a
-- route that has already matched the token to an order.
--
-- No update policy either. An address is on this list or it is not; changing
-- one into another would be putting words in somebody's mouth. Taking a person
-- off is a delete, and only she can do it, only when they ask.
create policy "admin read" on feedback_optouts for select to authenticated using (is_admin());
create policy "admin delete" on feedback_optouts for delete to authenticated using (is_admin());

comment on table feedback_optouts is
	'Addresses that asked not to be sent feedback requests. Never suppresses order emails.';
