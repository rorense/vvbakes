-- ---------------------------------------------------------------------------
-- Product image storage.
--
-- Public bucket: the images are on the shop page, so there is nothing to hide
-- and a public bucket lets next/image serve them straight from the CDN.
-- Uploads are compressed to WebP in the browser before they get here, so the
-- 5 MB ceiling is a backstop rather than a working limit.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
	'product-images',
	'product-images',
	true,
	5242880,
	array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
	public = excluded.public,
	file_size_limit = excluded.file_size_limit,
	allowed_mime_types = excluded.allowed_mime_types;

create policy "public read product images" on storage.objects
	for select using (bucket_id = 'product-images');

create policy "admin insert product images" on storage.objects
	for insert to authenticated
	with check (bucket_id = 'product-images' and is_admin());

create policy "admin update product images" on storage.objects
	for update to authenticated
	using (bucket_id = 'product-images' and is_admin())
	with check (bucket_id = 'product-images' and is_admin());

create policy "admin delete product images" on storage.objects
	for delete to authenticated
	using (bucket_id = 'product-images' and is_admin());
