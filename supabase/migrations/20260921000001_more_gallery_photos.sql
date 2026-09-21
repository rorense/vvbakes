-- ---------------------------------------------------------------------------
-- More room in the product gallery.
--
-- The column shipped with a ceiling of eight, and the reasoning written beside
-- it was that nobody scrolls a ninth thumbnail on a phone. That was a guess
-- about how the page would be read, and it had hardened into a rule about what
-- she is allowed to photograph. The page has since changed underneath it: the
-- frame stacks photos rather than repointing one element, and it stops
-- downloading eagerly well before this number, so the ones past that point cost
-- nothing until somebody picks them.
--
-- So twenty five, which is a ceiling rather than a target. It is here to catch a
-- loop gone wrong, not to ration angles.
--
-- Nothing else about the column moves: same bucket, same shape of value, same
-- meaning for position, and a hole in the list is still refused because a null
-- path is a photo nothing could show. Widening a check can only accept rows it
-- used to reject, so every product already stored still satisfies it and
-- nothing is rewritten.
-- ---------------------------------------------------------------------------

-- The original was an anonymous column check, which Postgres named itself. It
-- goes by that name, and what replaces it is named on purpose so that a re-run
-- drops and recreates its own rule rather than piling up copies of it. Both
-- drops are guarded, so this applies to a database that has either constraint
-- or neither, which is what lets tests/pg.ts apply the file twice.
alter table products
	drop constraint if exists products_gallery_image_paths_check;

alter table products
	drop constraint if exists products_gallery_image_paths_fit;

alter table products
	add constraint products_gallery_image_paths_fit
		check (
			coalesce(array_length(gallery_image_paths, 1), 0) <= 25
			and array_position(gallery_image_paths, null) is null
		);

comment on column products.gallery_image_paths is
	'Extra photos in the product-images bucket, shown under image_path. At most twenty five, in order.';
