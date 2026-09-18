-- ---------------------------------------------------------------------------
-- More than one photo per product.
--
-- One photo has been the whole story of a product since the shop opened, and it
-- is the wrong number for most of what she bakes. A cake has a side and a top;
-- a box of cupcakes is a box from above and one cupcake close enough to see the
-- piping; the chiffon is a whole cake and a slice of it. All of that used to
-- have to be one picture, and the one picture always lost something.
--
-- So an array of extra photos beside the one that already exists, rather than a
-- table. Nothing points at a product photo, no order carries one, and the order
-- of the list is the only thing about it worth keeping, which is exactly what
-- array position already stores. A table would buy a row identity that nothing
-- would ever use and cost a second round trip on every product page.
--
-- `image_path` stays what it is: the main photo, the one on the card, in the
-- basket, and at the top of the product page. These are the ones underneath it.
-- Keeping them apart is what stops a reorder in the admin quietly changing
-- which photo the shop grid shows.
--
-- Same bucket and same shape of value as `image_path` and the variants', so the
-- uploader, the URL builder and the storage policies all carry over untouched.
--
-- Eight is a ceiling rather than a target. Nobody scrolls a ninth thumbnail on
-- a phone, and the constraint is there to catch a loop gone wrong rather than
-- to argue with her about a seventh angle.
--
-- No alt text per photo, for the reason the variants have none: the sentence
-- she wrote describes the main photo, these are the same thing from another
-- side, and asking for three more sentences is asking for three empty boxes.
-- The page names them by position instead.
-- ---------------------------------------------------------------------------

alter table products
	add column gallery_image_paths text[] not null default '{}'
		check (
			coalesce(array_length(gallery_image_paths, 1), 0) <= 8
			and array_position(gallery_image_paths, null) is null
		);

comment on column products.gallery_image_paths is
	'Extra photos in the product-images bucket, shown under image_path. At most eight, in order.';
