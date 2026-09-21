-- ---------------------------------------------------------------------------
-- A star rating per product, given alongside the words on the feedback form.
--
-- The feedback form was built deliberately without one. Its own comment says
-- so: "no rating out of five, no categories, no 'how did you hear about us'",
-- because it is opened by somebody doing the shop a favour and every field
-- that is not the favour costs answers. That reasoning still holds, and this
-- is the one exception, for a reason that did not exist then: a rating is the
-- only thing that puts stars beside a product in a search result, and stars
-- are the difference between a listing people click and one they scroll past.
--
-- Why the rating hangs off the *product* and not the order.
--
-- Because an order-level rating is a rating of the business, and Google will
-- not show those when the business collected them itself: "If the entity
-- that's being reviewed controls the reviews about itself, their pages that
-- use LocalBusiness or any other type of Organization structured data are
-- ineligible for star review feature." A rating of a cake is a rating of a
-- product, which is the ordinary merchant case and is eligible. So the column
-- that would have been simplest to add is the one that would have bought
-- nothing.
-- ---------------------------------------------------------------------------

create table feedback_ratings (
	id uuid primary key default gen_random_uuid(),
	feedback_id uuid not null references feedback (id) on delete cascade,
	-- Cascades rather than nulls: a rating exists to be averaged into one
	-- product's score, so a rating whose product is gone has nothing left to
	-- say. This is the opposite of `order_items.product_id`, which nulls,
	-- because an order line has to go on describing what was actually bought
	-- after the product is withdrawn.
	product_id uuid not null references products (id) on delete cascade,
	rating smallint not null check (rating between 1 and 5),
	created_at timestamptz not null default now(),
	-- One rating per product per order. An order holding two lines of the same
	-- product in different flavours is still one opinion of that product, and
	-- letting it count twice would let a single order move the average further
	-- than the next one.
	unique (feedback_id, product_id)
);

-- The summary function below groups by this.
create index feedback_ratings_product_idx on feedback_ratings (product_id);

alter table feedback_ratings enable row level security;

-- Shaped like `feedback`, which is the table it hangs off: no public read and
-- no insert policy for anybody. Submissions go through the service role from
-- the server, and the public half of this data leaves through the function
-- below rather than through the table.
create policy "admin read" on feedback_ratings for select to authenticated using (is_admin());
create policy "admin delete" on feedback_ratings for delete to authenticated using (is_admin());

-- ---------------------------------------------------------------------------
-- What anon may learn about the ratings, which is the average and the count.
--
-- Shaped after `order_counts_between`, and for the same reason: the public
-- pages need an aggregate and must not be handed the rows. A row here is
-- (which order, which cake, what they thought), and a shop this size has few
-- enough orders that one row is close to naming the customer. The average and
-- the count are what the Product markup publishes, so they are all that comes
-- out.
--
-- Ratings from unpublished feedback count. The consent box is about quoting
-- somebody's *words* under their *name*; a number folded into an average is
-- neither, and an average of only the reviews she chose to publish would be a
-- rating of her publishing decisions rather than of the cake.
-- ---------------------------------------------------------------------------
create or replace function product_rating_summary()
returns table (product_id uuid, rating_count int, rating_average numeric)
language sql
stable
security definer
set search_path = public
as $fn$
	select r.product_id, count(*)::int, round(avg(r.rating)::numeric, 2)
	from feedback_ratings r
	group by r.product_id;
$fn$;

revoke execute on function product_rating_summary() from public;
grant execute on function product_rating_summary() to anon, authenticated, service_role;
