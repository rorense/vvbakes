-- ---------------------------------------------------------------------------
-- Inspiration photo storage.
--
-- Public read, for the same reason the product bucket is: the owner opens these
-- from the admin and from her notification email, the customer sees them again
-- on their order page, and none of those can carry a signed URL that expires.
-- What keeps one customer's photo away from the next is the path, which is
-- minted on the server from a UUID and appears nowhere a stranger can reach.
-- That is the bargain the order status page already makes with its token.
--
-- Note what is *not* here: no insert policy for anon. A customer's photo is
-- uploaded by the server as part of placing the order, using the service role,
-- so there is no upload endpoint an anonymous visitor can point a script at.
-- The 2 MB ceiling is a backstop; the browser re-encodes to WebP at around
-- 400 KB before anything is sent.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
	'order-inspiration',
	'order-inspiration',
	true,
	2097152,
	array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
	public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

create policy "public read inspiration images" on storage.objects
	for select using (bucket_id = 'order-inspiration');

-- The owner can tidy up: an order cancelled months ago has no reason to keep
-- its photos around. The service role bypasses all of this when writing.
create policy "admin delete inspiration images" on storage.objects
	for delete to authenticated
	using (bucket_id = 'order-inspiration' and is_admin());
