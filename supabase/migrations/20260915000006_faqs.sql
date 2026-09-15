-- ---------------------------------------------------------------------------
-- The questions the home page answers.
--
-- These shipped as five paragraphs inside the page component, assembled from
-- site_settings. They read correctly and could not be changed without a deploy,
-- which is the wrong way round: "do you do gluten free", "can I pay cash",
-- "how far will you drive" arrive by DM and want an answer on the page that
-- afternoon, not in the next release.
--
-- A table rather than a jsonb column on site_settings, because the list is
-- ordered and each row wants its own length checks. Nothing points at an faq,
-- so the settings form replaces the whole list on every save, the way bundle
-- prices already do, and a row has no identity worth preserving.
--
-- An empty table is a real answer: the home page drops the section entirely
-- rather than showing a heading with nothing under it.
-- ---------------------------------------------------------------------------

create table faqs (
	id uuid primary key default gen_random_uuid(),
	question text not null check (length(btrim(question)) between 1 and 200),
	answer text not null check (length(btrim(answer)) between 1 and 1500),
	sort_order int not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index faqs_sort_idx on faqs (sort_order);

create trigger faqs_set_updated_at before update on faqs
	for each row execute function set_updated_at();

alter table faqs enable row level security;

create policy "public read" on faqs for select using (true);
create policy "admin all" on faqs for all to authenticated
	using (is_admin()) with check (is_admin());

-- Starting answers, in the owner's voice, for a site that has none.
--
-- Deliberately free of lead times, prices and delivery areas. Those live in
-- site_settings and are already on the page beside this list; an answer that
-- repeats one is an answer that goes quietly wrong the day it changes, and
-- nothing here rewrites itself once the owner has edited it.
--
-- Guarded rather than unconditional so that re-running this against a site that
-- has since written its own questions does not put the defaults back.
insert into faqs (question, answer, sort_order)
select v.question, v.answer, v.sort_order
from (values
	(
		'How much notice do you need?',
		'The calendar only shows days I can still bake for, so anything you can pick, you can have. The good dates go first, so ask as soon as you know.',
		1
	),
	(
		'What does it cost, and when do I pay?',
		'Menu prices are on the shop page. A custom cake depends on the size and how much work goes on top, so I price it once I know what you''re after. Nothing is charged here: I email you the price, the bank details and a reference, and you transfer it from there.',
		2
	),
	(
		'Can you work around an allergy?',
		'Everything on the menu lists what''s in it, and I''ll tell you the same for a custom cake. Some swaps are easy and some change the cake completely, so say something when you order rather than on the day.',
		3
	),
	(
		'Can you make a cake I''ve seen online?',
		'Send the photo through with your order. I''ll tell you what I can match and what I''d do differently. Shape and colour travel better than an exact copy.',
		4
	),
	(
		'Can I change or cancel an order?',
		'Tell me as soon as you know. Nothing is final until I confirm it, and even after that I would far rather hear early than on the day.',
		5
	)
) as v (question, answer, sort_order)
where not exists (select 1 from faqs);
