# vvbakes

The vvbakes website: a product catalogue, an order form, and an admin backend
for managing products, baking days and orders.

Built with Next.js, Tailwind and Supabase, deployed on Vercel.

---

## Running it locally

```bash
npm install
npm run dev
```

That works straight away on a fresh clone. Without a Supabase project the site
serves a built-in stand-in catalogue and shows a dark banner saying so, which is
enough to work on the design. Ordering and the admin need a real database.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm run check` | Verifies your Supabase setup end to end, without printing any keys |
| `npm run make-admin -- <email>` | Gives an existing Supabase user access to the admin |
| `npm test` | Runs the test suite, including real SQL against an in-process Postgres |
| `npm run test:race` | Proves two customers can't take the same last slot (writes real orders) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier over the whole repo |
| `npm run icons` | Regenerates every icon from `assets/logo-source.png` |
| `npm run emails:preview` | Renders all five emails to `.email-preview/` |

---

## First-time setup

You need three accounts: Supabase (database), Vercel (hosting) and a Gmail
address (sending email). All three have free tiers that comfortably cover a
home bakery.

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com). Choose the region
   closest to your customers. **Sydney** for New Zealand.
2. Save the database password somewhere safe; you cannot see it again.
3. Go to **Project Settings → API Keys**. You need three values:

   | In the dashboard | Goes into |
   | --- | --- |
   | Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
   | **Publishable key** (`sb_publishable_…`) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
   | **Secret key** (`sb_secret_…`) | `SUPABASE_SERVICE_ROLE_KEY` |

   Supabase renamed these; older documentation calls them the anon/public key
   and the service_role key. The variable names keep the old wording because
   that is what the client libraries expect.

   The publishable key is meant to be in the browser, row level security is
   what protects the data, not the key. The secret key bypasses all of that, so
   it stays on the server and never goes in a `NEXT_PUBLIC_` variable.

4. Copy `.env.example` to `.env.local` and fill those in.
5. Run `npm run check`. It works through every step below and tells you what is
   still missing. It never prints a key.

### 2. Create the tables

Install the Supabase CLI and push the migrations:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Then run `supabase/seed.sql` once. The easiest way is to paste it into the
**SQL Editor** in the Supabase dashboard and run it. It creates the settings
rows, the seven weekday rows, three categories and the five products from the
market menu. It is safe to run more than once.

No bank details are in that file. You enter those in the admin later.

### 3. Create your login

1. **Authentication → Users → Add user**. Use a real email and a strong
   password, and tick **Auto Confirm User** so you can sign in immediately.
   Create it here rather than anywhere else, so the password is only ever
   between you and Supabase.
2. Then, from the project:

   ```bash
   npm run make-admin -- you@example.com
   ```

   That finds the user and adds the `admins` row the site checks for. Use
   `--remove` on the same command to take access away again.

3. **Authentication → Sign In / Providers**, and turn **"Allow new users to
   sign up"** off. Only the account you just made should be able to get in.

Being able to sign in is not the same as being the owner: the site checks for a
row in `admins` as well, so even if sign-ups were somehow left on, a new account
would see nothing.

### 4. Email

The site sends five emails: one to you when an order arrives, and four to the
customer as their order moves along. They go out through
[Resend](https://resend.com), from an address on a domain you own.

1. Add the bare domain at **Resend → Domains**. There is no need to verify a
   subdomain to keep the apex MX record free: Resend puts SPF and its bounce MX
   on a `send.` subdomain of its own accord, and only DKIM lands on the apex. So
   a real mailbox can still be added to the domain later.
2. Copy the records it gives you into your DNS. On Cloudflare every one of them
   has to be **DNS only**, the grey cloud, never proxied. Wait for the domain to
   read **Verified**.
3. Create an API key under **Resend → API Keys**. Sending permission is enough,
   and a full-access key can read the contents of everything you have ever sent.
4. Put both in `.env.local`:

   ```
   RESEND_API_KEY="re_..."
   EMAIL_FROM="vvbakes <orders@yourdomain>"
   ```

   `EMAIL_FROM` has to sit on the domain you verified.

5. Under **Resend → Webhooks**, point a webhook at
   `https://yourdomain/api/webhooks/resend` and subscribe it to
   **email.bounced** and **email.complained**. Put the signing secret it shows
   you in `RESEND_WEBHOOK_SECRET`, in `.env.local` and on the deployment.

   Without this a bounce goes nowhere. `deliver` can only report that Resend
   accepted the message; whether it arrived is decided minutes later, so a
   customer who mistyped their address would leave "Sent the order-confirmed
   email" in the trail and never hear anything. With it, the refusal is recorded
   against the order and the admin says so in red at the top of the page.

6. In the admin, under **Settings → Getting in touch**, set **Send new orders
   to**, which is where you get told about a new order, and **Contact email**,
   which is where a customer's reply lands.

That second address does not have to be on the domain. Reply-To is not signed
and nothing checks it, so it can be an ordinary Gmail or Yahoo mailbox she
already reads; only the From address has to be one Resend has verified. Resend's
free tier is far more than this shop needs.

Resend does not create a DMARC record for you. It is worth adding one as
`_dmarc` TXT, starting at `v=DMARC1; p=none; rua=mailto:you@example.com`, which
changes nothing about how mail is treated but starts the reports coming. Tighten
to `p=quarantine` once those look clean.

### 5. Deploy

1. Import the repository at [vercel.com](https://vercel.com).
2. Add every variable from `.env.local` under **Settings → Environment
   Variables**, plus `CRON_SECRET`, any long random string.

   `NEXT_PUBLIC_SUPABASE_URL` has to be there **before the first build**, not
   just at runtime: the build reads it to prerender the shop and to whitelist
   the image host, and a build without it silently ships the demo catalogue.

3. Deploy.
4. Once it is live, set `NEXT_PUBLIC_SITE_URL` to the real address and
   redeploy. Until you do, the sitemap and the links in emails point at
   whatever Vercel called the deployment.

`vercel.json` already schedules a daily request to `/api/cron/keepalive`. A free
Supabase project pauses after seven days without activity, which would take the
shop offline without warning; one read a day prevents that.

Visitor numbers come from Vercel Web Analytics and real-world load times from
Speed Insights, each switched on per project from its own tab in the
dashboard. Both are cookie-free, so there is still no consent banner to add.
Speed Insights earns its place on this site in particular: the visitors are on
mobile data in New Zealand and the server is in Seoul, which is exactly what a
desktop test on fibre will never show you.

`components/site/Analytics.tsx` mounts both, and `lib/analytics.ts` rewrites
the path before either one sends anything: an order-status visit is reported as
`/order/[token]` rather than with the real token, and `/admin` is dropped
altogether. So the dashboards can say how many people opened an order and how
fast that page felt, without recording which order it was, and the owner
clicking around her own back office is not counted as traffic.

### Where things run

`vercel.json` pins the server functions to `icn1` (Seoul) because that is where
the Supabase project lives. This matters more than it sounds: Vercel's default
is `iad1` (Washington DC), so every database query on a page that isn't cached
went Sydney → Washington → Seoul and back. Measured on the live site, `/order`
took 1.6 seconds; cached pages took 0.14.

**If you ever recreate the Supabase project, put it in Sydney**
(`ap-southeast-2`) and change this to `["syd1"]`. Seoul is about 9,500km from
Auckland; Sydney is 2,200km. The database region cannot be changed after a
project is created, which is why it is worth getting right while the project is
still small.

---

## How it fits together

### Caching

The home page, the shop and each product page are prerendered and revalidated
every five minutes. They deliberately read the database through a cookie-free
client (`lib/supabase/public.ts`): a page that so much as touches `cookies()`
is dynamic whatever `revalidate` says, which would turn every visit into a
database round trip. Every table these pages read has a `using (true)` select
policy, so an anonymous reader sees exactly what the owner would anyway.

Edits in the admin do not wait five minutes. Every admin action calls
`revalidatePath` for the pages it affects, so a price change or a sold-out
toggle is live on the next request.

`/order` is excluded on purpose. It has to show which dates still have room,
and a five-minute-old answer there means overselling.

### Ordering

A customer builds an order in their browser (kept in `localStorage`, since there
are no accounts), picks a pickup date on the calendar, and submits. The server
hands the whole thing to a single Postgres function, `place_order`, which:

- re-prices every line from the database, ignoring whatever the browser said;
- checks lead time and the daily cut-off in the bakery's own timezone;
- takes an advisory lock on the pickup date, counts the orders already on it,
  and refuses if the day is full;
- writes the order and its lines in one transaction.

Nothing about a price or a date is trusted from the browser. That matters most
in the case where two people load the last slot at the same time: without the
lock they would both see one space free and both be accepted.

Once the order is written the browser is sent to `/order/<token>/thanks`, which
says the request landed and hands over the status link. It is a page of its own
rather than a banner on the form so the acknowledgement survives a reload, and
it redirects to `/order/<token>` for any order that is no longer new: a
bookmark opened a week later should show where the order actually got to rather
than thank someone a second time.

Prices are also computed in the browser so the form can show a running total.
`lib/pricing.ts` and the SQL function are two implementations of the same rule,
so a test runs both across many quantities and tier shapes and fails if they
ever disagree on a single cent.

### Inspiration photos and links

Almost nobody describes a cake in words alone, so an order can carry up to three
photos and one link. The photos are re-encoded to WebP in the browser at around
400 KB each and then travel **with the order itself**, not through an upload
endpoint of their own: by the time they reach Supabase Storage the submission
has already passed the honeypot, the timing check and the per-address rate
limit, which is why the `order-inspiration` bucket has no anonymous insert
policy. If `place_order` then refuses the order, the uploaded files are removed
again rather than left behind.

The bucket is public to read, like the product one, because the photos are shown
in the admin, in the owner's notification email and on the customer's own order
page, none of which can use a URL that expires. What keeps one customer's photo
away from the next is the path, minted on the server from a UUID.

The link is the one part of an order a stranger writes that ends up inside an
`href`. `new URL()` will happily parse `javascript:`, so every place that renders
it checks the scheme first through `isHttpUrl` in `lib/validation.ts`.

A photo or a link with no words at all is a complete request: `place_order`
counts either as a brief, so someone who has the cake saved on their phone and
nothing to add is no longer turned away with "your order is empty".

### Bundle pricing

"4 for $12" is stored as a tier. When someone orders five cupcakes they pay
`$12 + $3`, not `5 × $3`. Where several bundles overlap, the customer gets the
cheapest combination, worked out properly rather than by taking the biggest
bundle first, which overcharges whenever a smaller bundle has a better rate.

A product can also be sold only in multiples: give it a step of `2` and the
form offers even numbers only, advertising itself as "2 for $5" rather than by a
single-unit price nobody can buy. Nothing in the seed uses it. Cookies looked
like that shape at first, but a `$5` pack of two is one unit, not two, and
saying so reads better on the menu and counts better in the basket.

### Flavours, sizes and other variants

A cake is not one thing. It is chocolate, or carrot, or red velvet, and those
are not the same price. Add them under **Flavours** on the product form: each
one is a name and a price of its own, and what the choice is *called* is a field
too, so a cake asks for a flavour and a tin asks for a size.

The product keeps everything else: one photo, one description, one set of
allergens, one place in the shop. Adding the first variant turns the product
into something a customer picks from; removing the last one turns it back into a
single item at the price above. There is no switch to forget.

A few things worth knowing:

- **Each flavour can sell out on its own.** A product with every flavour off
  reads as sold out, and the shop card says so.
- **"Most per order" counts the product, not the flavour.** A maximum of four
  means four cakes, not four of each.
- **A bundle price buys that many of one flavour.** "4 for $12" is four
  chocolate, not a mixed box, so it is a bigger discount on a dearer flavour
  than on a cheaper one. The admin's price preview shows the answer per flavour
  before you save, which is the point of it.
- **Orders keep the flavour they named.** `order_items` snapshots the name the
  same way it snapshots the product's, so renaming, repricing or deleting a
  flavour never rewrites an order that has already been placed.

The stand-in catalogue used without a database has no variants in it, because it
mirrors `supabase/seed.sql` and the seed is a straight transcription of the
printed market menu. Add one in `/admin` to see the picker.

### What is private

`orders` has no row-level-security policy for anonymous visitors, and no insert
policy for anybody. Orders are created only through `place_order`, called
server-side. If the public key leaked tomorrow, it would expose the menu and
nothing else, no names, no phone numbers, no addresses.

Bank details and the pickup street address live in a separate table with no
anonymous policy at all. They appear in exactly two places: the confirmation
email, and the customer's own order page once you have confirmed it. They are on
no public page.

The one exception is `/menu`, the card used at physical markets, which still
shows the account number by design. It is `noindex`, absent from the sitemap and
not linked from anywhere.

### The calendar

Two layers. **Your usual week** says which weekdays you bake and how many orders
you can take on each. Individual dates override that, closed for a holiday, or
open with extra capacity for a market. The home page and the order form draw the
same month grid from the same rules, so the day you click on one is the day you
land on in the other. Only open days with room can be chosen; a day that is
full, closed or inside the notice period is drawn and greyed rather than left
out, because a gap where next Saturday should be tells a customer nothing about
why they cannot have it.

Closing a day that already has orders on it does not cancel them. It only stops
new ones, and the admin says so before you save.

### Questions

The answers under "The ones I get asked most" on the home page are rows in
`faqs`, edited in **Settings → Questions**. Add, reorder and remove them there.
The order in the list is the order on the page, and an empty list hides the
section outright rather than leaving a heading with nothing under it.

They are plain text on purpose. A lead time or a delivery area typed into an
answer will not follow the setting it duplicates, so answer the question and
leave the numbers to the pickup panel and the calendar further up the page.

### Kind words

Customer reviews work the same way: rows in `reviews`, edited in **Settings →
Kind words**, shown on the home page between the menu and "How it works". A
name, what they said, and an optional line underneath for the occasion.

Nothing is seeded, and nothing should be. Every other table here ships
placeholder content so a fresh clone looks like a bakery; a placeholder review
is a sentence attributed to somebody who never said it, on a public page under
a real business's name. The band is hidden while the table is empty, so the site
is complete without reviews and grows the section the day a real one is added.
Use the name the customer would be happy to see published.

---

## Verifying it works

Start with `npm run check`, which covers the whole setup: keys, tables, seed
data, the owner account, the security boundary, storage and email. Then:

```bash
npm test          # migrations, RLS policies, pricing, availability,
                  # analytics redaction. 153 tests
npm run typecheck
npm run build
```

Email is the one thing none of those can prove, because it leaves the machine.

```bash
npm run emails:test -- you@example.com
```

That sends the customer's confirmation and the owner's new-order alert to an
address you name, through the real templates and the real sending setup. Check
that both arrive in the inbox rather than spam, that the header badge loads, and
that Reply on each goes where it should: the confirmation to the contact email,
the alert to the customer. Worth running after any change to how mail is sent,
and never at a customer's address.

Then, by hand:

**The catalogue.** `/shop` should show three bands with five products, priced
"$3 each · 4 for $12", "$5 / pack", "$5 / slice" and "$3 / slice". Toggle a
product to sold out in the admin and reload, the badge should appear.

**An order.** Add five cupcakes and two packs of cookies; the total should be
exactly `$25.00`, and the cupcake line should read
`1 x 4 for $12.00 + 1 x $3.00 each`.
Submit it, then check that you got the notification email and the customer got
the acknowledgement.

**A cake with a picture.** Place an order with an empty basket, two photos and a
Pinterest link. It should be accepted, the photos should appear in the admin
next to the price box, in your notification email and on the customer's order
page, and the link should open. Then try `javascript:alert(1)` in the link
field; the form should refuse it.

**Confirming.** Open the order in the admin and confirm it. The customer's email
should now carry the bank details, the reference and the full pickup address.
The same details should appear on their order page, and not before.

**Capacity.** Set a Saturday's capacity to 1 in the calendar and place two
orders for it. The second should be refused with "That date just filled up".
For the concurrent case:

```bash
npm run test:race -- 2026-09-19
```

That fires two orders at the same instant and expects exactly one to succeed.

**What a stranger can see.** With only the anon key, `orders` and
`site_settings_private` should both come back empty, and `place_order` should be
refused outright. The test suite covers this, but it is worth confirming against
the real project once.

**Bank details.** View source on `/`, `/shop` and `/order` and search for your
account number. It should not be there.

---

## Layout

```
app/
  (site)/        the public site: home, shop, product pages, order form, thanks, status page
  (menu)/menu/   the unlisted market card, unchanged from the original
  admin/         sign-in, dashboard, products, categories, calendar, orders, settings
  api/cron/      the daily keep-alive
components/
  ui/            buttons, fields, the arch photo frame, the hairline list
  site/          header, footer, product cards
  order/         the order form and its parts
  admin/         the admin's own components
emails/          the five transactional emails
lib/             pricing, availability, dates, Supabase clients, validation
supabase/        migrations and the seed
tests/           SQL run against a real Postgres, in-process
```

Two pieces of logic exist twice on purpose, pricing and availability, once in
TypeScript for the browser and once in SQL for the database. The SQL is always
the authority. If you change one, change the other, and the parity test will
tell you if you did not.

---

## Still to do

Things the site is ready for but which need content or a decision:

- **Photos.** Products fall back to the logo on a coloured tile, which looks
  deliberate but is not as good as a real photograph. Shoot them on one
  backdrop, roughly square or slightly tall.
- **Descriptions and allergens** for each product.
- **Real pickup details**: suburb, full address, times, and how much notice you
  need. The seeded values are placeholders.
- **A domain**, which also unlocks proper email sending.
