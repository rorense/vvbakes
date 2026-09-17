-- ---------------------------------------------------------------------------
-- Instagram image storage.
--
-- Our copy of each picture in the feed. Public read, because the pictures are
-- on the home page and next/image has to be able to fetch them without a
-- signed URL, which is the same bargain the product bucket makes.
--
-- No insert policy for anyone. These are written by the cron using the service
-- role, so there is no upload endpoint to point a script at — the same shape as
-- the inspiration bucket, and for the same reason.
--
-- The filename is the Instagram media id, so re-syncing a post overwrites its
-- own picture rather than accumulating copies. 5 MB matches the product bucket;
-- Instagram's own downsized JPEGs land well under a megabyte, so this is a
-- backstop against a surprise rather than a working limit.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
	'instagram',
	'instagram',
	true,
	5242880,
	array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
	public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

create policy "public read instagram images" on storage.objects
	for select using (bucket_id = 'instagram');

-- So the owner can clear out a post she has since deleted from Instagram. The
-- cron prunes these itself on every run; this is for the times it cannot.
create policy "admin delete instagram images" on storage.objects
	for delete to authenticated
	using (bucket_id = 'instagram' and is_admin());
