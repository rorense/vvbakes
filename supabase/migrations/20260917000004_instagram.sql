-- ---------------------------------------------------------------------------
-- The Instagram feed, kept as our own copy.
--
-- The obvious way to put a feed on a page is to ask Instagram for it at render
-- time. Three things make that the wrong shape here.
--
-- The `media_url` the API hands back is a signed CDN link that stops working
-- after a few days, so it cannot be stored and it cannot be trusted to still
-- resolve by the time a visitor's browser asks for it. The token behind the
-- call expires every sixty days and has to be traded for a new one, which is a
-- write, and a page render is the wrong place to do a write. And a page that
-- fetches from Meta on every visit hands Meta a record of everyone who reads
-- it, which is not a trade this site makes anywhere else.
--
-- So the cron copies the pictures into our own bucket once and the page reads
-- rows, exactly like the shop does. The feed keeps working while Instagram is
-- down, the images go through next/image with the rest of the site, and no
-- request leaves the page.
--
-- Two tables: what to show, and what the syncing job needs to remember.
-- ---------------------------------------------------------------------------

-- One post, already downloaded.
--
-- The primary key is Instagram's own media id rather than a uuid of ours, so a
-- sync is an upsert and a post that has not changed does not churn. A row only
-- exists once its picture is safely in the bucket, which is why `image_path` is
-- not null: there is no half-stored post, and the page never has to filter for
-- one.
--
-- `media_type` is deliberately unconstrained beyond a length check. Instagram
-- has added values to it before and will again, and a check constraint that
-- rejects a new one would silently drop the newest post, the worst possible
-- row to lose. The page treats anything it does not recognise as a picture.
create table instagram_posts (
	id text primary key check (length(btrim(id)) between 1 and 64),
	permalink text not null check (length(permalink) between 1 and 500),
	-- Truncated to Instagram's own 2,200 character ceiling on the way in. The
	-- room above it is so a caption can never be the reason a post is lost.
	caption text check (caption is null or length(caption) <= 3000),
	media_type text not null check (length(btrim(media_type)) between 1 and 40),
	-- Object path inside the `instagram` bucket, not a URL. See lib/images.ts.
	image_path text not null check (length(btrim(image_path)) between 1 and 300),
	-- When it was posted, not when we fetched it. This is the display order.
	posted_at timestamptz not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index instagram_posts_posted_idx on instagram_posts (posted_at desc);

create trigger instagram_posts_set_updated_at before update on instagram_posts
	for each row execute function set_updated_at();

alter table instagram_posts enable row level security;

create policy "public read" on instagram_posts for select using (true);
create policy "admin all" on instagram_posts for all to authenticated
	using (is_admin()) with check (is_admin());

-- What the sync job remembers between runs. One row, like site_settings.
--
-- The access token lives here rather than in an environment variable because
-- refreshing it is a write: Instagram trades a token that is at least a day old
-- for a fresh sixty-day one, and the new value has to outlive the request that
-- fetched it. An env var cannot be changed without a redeploy, so a site whose
-- token lived only in the environment would go quietly blank sixty days after
-- launch. INSTAGRAM_ACCESS_TOKEN is still read, once, to seed this row.
--
-- `last_error` is the whole reason this table has more than one column. When
-- this breaks it breaks silently: a stale token returns an error, the page
-- keeps rendering yesterday's posts, and nobody finds out for weeks. The cron
-- writes whatever went wrong here so there is something to look at.
create table instagram_sync (
	id smallint primary key default 1 check (id = 1),
	access_token text,
	-- Null means "expiry unknown", which is the state a freshly seeded token is
	-- in. The job treats it as due for refresh.
	token_expires_at timestamptz,
	refreshed_at timestamptz,
	-- Last time posts were actually written, not last time the job ran.
	synced_at timestamptz,
	last_error text check (last_error is null or length(last_error) <= 2000),
	updated_at timestamptz not null default now()
);

create trigger instagram_sync_set_updated_at before update on instagram_sync
	for each row execute function set_updated_at();

-- Row level security on, and deliberately no policies at all.
--
-- Every other table here grants the owner `admin all`. This one holds a live
-- API credential, and the owner has no reason to read it: she never types it
-- into anything, and the only code that touches it is the cron, which uses the
-- service role and bypasses this entirely. No policy means no path from a
-- signed-in browser session to the token, which is a stronger guarantee than
-- trusting every future admin query not to select it.
alter table instagram_sync enable row level security;

insert into instagram_sync (id) values (1) on conflict (id) do nothing;
