-- ---------------------------------------------------------------------------
-- A counter for things that were *attempted*, not things that succeeded.
--
-- The order form already had a brake, but it counted rows in `orders`. A
-- submission that was refused — bad email, a date that had filled up, a payload
-- that never parsed — writes no row, so it was never counted, and a script
-- could keep throwing them at the server for free. Worse, the inspiration
-- photos were already in the bucket by the time the refusal happened.
--
-- This counts the attempt itself, before any of that work is done. It is a
-- coarse brake on a small shop, not a general-purpose limiter: one row per
-- bucket and key, holding a count and the moment its window opened.
--
-- The window is fixed rather than sliding. A caller who times it right can get
-- up to twice the limit across a boundary, which for "stop drive-by form spam"
-- costs nothing and saves keeping a row per attempt.
--
-- Nothing anonymous can reach this. The table has RLS on and no policies, and
-- all three functions are granted to `service_role` only, the same shape as
-- `place_order`.
-- ---------------------------------------------------------------------------

create table rate_limits (
	-- What is being counted: 'order' or 'login'.
	bucket text not null,
	-- Who is being counted. Always a salted hash from hashIp(), never an address.
	key text not null,
	attempts int not null default 0,
	window_start timestamptz not null default now(),
	primary key (bucket, key)
);

-- For the sweep below, which is the only query that does not go by primary key.
create index rate_limits_window_idx on rate_limits (window_start);

alter table rate_limits enable row level security;
-- Deliberately no policies. Reached only through the functions below, which
-- only the service role may execute.

/**
 * Counts one attempt and says whether it is still allowed.
 *
 * Returns true while the caller is under the limit, false once they are over
 * it. The attempt is recorded either way: someone who keeps hammering after
 * being refused keeps their window open rather than waiting it out.
 */
create or replace function record_attempt(
	p_bucket text,
	p_key text,
	p_limit int,
	p_window interval
) returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
	v_attempts int;
begin
	-- No key means no address to count against, which is what local development
	-- and some proxies look like. Fail open — an unthrottled visitor is a much
	-- smaller problem than a shop that refuses everyone.
	if p_key is null or btrim(p_key) = '' then
		return true;
	end if;

	-- One statement, so concurrent callers serialise on the row lock instead of
	-- racing between a read and a write.
	insert into rate_limits as r (bucket, key, attempts, window_start)
	values (p_bucket, p_key, 1, now())
	on conflict (bucket, key) do update
		set attempts = case
				when r.window_start < now() - p_window then 1
				else r.attempts + 1
			end,
			window_start = case
				when r.window_start < now() - p_window then now()
				else r.window_start
			end
	returning r.attempts into v_attempts;

	return v_attempts <= p_limit;
end;
$fn$;

/**
 * Forgets a key's attempts.
 *
 * Used after a successful admin sign-in, so that the owner getting their
 * password right clears whatever a bot has been running up from the same
 * address. Orders deliberately do not call this: a placed order is still an
 * attempt, and the shop wants it counted.
 */
create or replace function clear_attempts(p_bucket text, p_key text)
returns void
language sql
security definer
set search_path = public
as $fn$
	delete from rate_limits where bucket = p_bucket and key = p_key;
$fn$;

/**
 * Drops rows whose window closed long ago.
 *
 * Called from the daily keepalive cron, which already exists and already runs
 * with the service role. A day is far longer than any window in use; the rows
 * are kept that long only so the table is cheap to look at when something looks
 * wrong.
 */
create or replace function sweep_rate_limits()
returns void
language sql
security definer
set search_path = public
as $fn$
	delete from rate_limits where window_start < now() - interval '1 day';
$fn$;

revoke execute on function record_attempt(text, text, int, interval)
	from public, anon, authenticated;
grant execute on function record_attempt(text, text, int, interval) to service_role;

revoke execute on function clear_attempts(text, text) from public, anon, authenticated;
grant execute on function clear_attempts(text, text) to service_role;

revoke execute on function sweep_rate_limits() from public, anon, authenticated;
grant execute on function sweep_rate_limits() to service_role;
