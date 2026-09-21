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
| `npm run og:fonts` | Re-downloads the two brand fonts the share cards draw with |
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

The custom cake is not in there. It is created by a migration instead, with its
sizes attached, because it is a product built out of rows the seed has no way to
write idempotently — so `/shop` ends up with six products, not five.

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

`vercel.json` already schedules two daily requests, both authorised with
`CRON_SECRET`:

- `/api/cron/keepalive` at 03:00. A free Supabase project pauses after seven
  days without activity, which would take the shop offline without warning; one
  read a day prevents that.
- `/api/cron/instagram` at 04:00. Pulls the latest posts into our own tables and
  bucket — see "The Instagram feed" below. Harmless and cheap if no token is
  set; it reports `skipped` and does nothing.

Two is the ceiling on Vercel's Hobby plan, so a third job means folding it into
one of these or moving up a plan.

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

### What a customer says about one item

Every product asks for a note. Products that want more can ask for two other
things as well, switched on per product in the admin:

- **Ask for photos and a link** (`wants_brief`) adds an uploader and a link
  field. For the things a picture is the brief for.
- **Ask for a flavour of their own** (`wants_custom_flavour`) adds a flavour box
  and a question about the frosting. For cupcakes you will make in a flavour
  that is not on the menu — not for a pandan chiffon, which comes how it comes.

All of it belongs to **the line**, not to the order. That is the part worth
knowing, because it used not to: there was one description at the bottom of the
order form covering everything in the basket, which had nowhere to put the
second cake when somebody ordered two different ones. A brief now travels on the
item it describes, is shown under that line everywhere an order is rendered, and
is part of what makes a line its own line — two cakes described differently stay
two lines however alike the rest of them looks. `cartLineKey` in `lib/cart.ts`
and the `group by` in `place_order` agree on that, and have to: the browser and
the database fold the same lines together or the total on the page is not the
total that gets charged.

The frosting is one question with two ways to answer it — a tick box for "to
match the flavour", or type what you want. The tick wins if both arrive, and the
column has a constraint refusing a row that tries to give two. `frostingLabel`
in `lib/brief.ts` turns the pair back into one sentence, so the basket, the
order page, the admin and the emails all word it identically.

Asking for a flavour of your own does not make an item unpriced. The menu price
is real; it is just a price the owner may add to once she has read what is being
asked, and the shop says so before the order is placed, on the order page after
it, and in the "I've got your request" email. The moment she sets a price, the
caveat disappears everywhere at once.

### Inspiration photos and links

Almost nobody describes a cake in words alone, so a line can carry up to three
photos and one link, and an order up to six photos across all its lines
(`MAX_INSPIRATION_PHOTOS` and `MAX_ORDER_INSPIRATION_PHOTOS` in
`lib/constants.ts`). The photos are re-encoded to WebP in the browser at around
400 KB each and then travel **with the order itself**, not through an upload
endpoint of their own: by the time they reach Supabase Storage the submission
has already passed the honeypot, the timing check and the per-address rate
limit, which is why the `order-inspiration` bucket has no anonymous insert
policy. If `place_order` then refuses the order, the uploaded files are removed
again rather than left behind.

Between being chosen on a product page and being sent, the files sit in the
browser's own IndexedDB — the cart in `localStorage` holds only their ids. So a
basket filled on a phone and submitted from a laptop arrives without them, and
the order form counts the gap and says so rather than pretending. Each line's
photos are appended under `linePhotos:<n>`, where n is that line's position in
the submitted items, which is the only thing tying a photo to the cake it
describes; an index naming no line is refused rather than guessed at.

The bucket is public to read, like the product one, because the photos are shown
in the admin, in the owner's notification email and on the customer's own order
page, none of which can use a URL that expires. What keeps one customer's photo
away from the next is the path, minted on the server from a UUID.

The link is the one part of an order a stranger writes that ends up inside an
`href`. `new URL()` will happily parse `javascript:`, so every place that renders
it checks the scheme first through `isHttpUrl` in `lib/validation.ts`.

### Extras

Candles, a gift box, a card: things that ride along with whatever was ordered.
Each product has **its own list**, edited on that product's page beside its
flavours and its bundle prices, so candles on a tiered cake can cost something
different from candles on a cupcake and neither is a shop-wide decision.

They are priced per unit of the line, so two cakes with candles is two sets of
candles. Bundle tiers do not apply — a bundle is your price for several of one
product, and nobody has quoted you for four sets of candles. A free extra is a
real one and still worth offering; it reads as "Free" rather than "$0.00".

An extra belongs to its product on the way in as well. `place_order` refuses an
id that names an extra on a *different* product, which matters beyond tidiness:
the basket is `localStorage` and the ids in it are the customer's to edit, so
without that check a line could carry the cheap candles off one product onto a
cake priced for the good ones. An unknown id and a switched-off one come back
the same way, as `EXTRA_UNAVAILABLE`.

Extras are snapshotted onto the order like everything else — name, price and
all — so renaming or deleting one never rewrites an order already placed. The
one thing an extra does *not* do is take its line down with it: if you delete an
extra while a basket is open, the order form drops the extra, says so, and keeps
the cake.

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

### Price on request

Some work cannot be priced before you have seen the brief. Tick **Price on
request** on a product and the shop stops quoting a number for it: the card and
the product page say "Price on request", the line adds nothing to the
customer's total, and the order arrives with the line reading "Price to follow"
rather than `$0.00`, which beside a custom cake reads as one you are giving
away.

Saying nothing at all is honest and it is also a wall: someone with no idea
whether a birthday cake is forty dollars or four hundred mostly does not ask. So
a product priced on request can carry a short table of **starting prices**.
`6" - 2 layers` at 45 reads as _from $45_, with a line for anything that adds to
one of them (`Additional layers`, ticked as adding to the others, reads as
_+ $10_) and a caveat underneath in your own words. They are edited under
**Price** on the product's own page, and only appear on a product this switch is
on for.

It is a guide and nothing more. No basket reads it, `place_order` does not know
it exists, and the line still totals zero until you quote it. The moment one of
those numbers could be charged it stops being a "from" and becomes a promise
about a cake nobody has described yet. Leave the table empty and the page says
only that the price depends on the brief, which is what every product priced on
request said before there was one.

Which is also why the switch takes the prices out of the admin wherever they
would be beside the point. A product priced on request is asked for no price per
combination and shown no price preview: the grid becomes a plain list of the
combinations with the on/sold-out switch each already had, and the starting
prices above take the preview's place. It is the one place where the rule below
— a combination with no price is one you do not make — cannot apply, because
there is no price to leave out. Every combination of the options is one a
customer can ask for, and **sold out** is how you take one off the page.

The two travel in one direction only. Ticking **Price on request** on a product
that already has gaps in its grid fills them in, so the form names them first —
_"Saving now starts offering Lemon · Three layers"_ — and you can switch those
to sold out before you save.

The custom cake is a product like any other because of this. It used to be a
second form at the bottom of the order page, with no product to browse to and
no way to order one alongside a box of cupcakes. Now it sits in the shop, asks
its questions like anything else, and the order it produces is an ordinary
order with one unpriced line on it.

You set the price on the order, in the admin, in the card above the status
buttons. An order with an unpriced line cannot be confirmed until you do, since
confirming sends bank details and a total that would be leaving the cake out.
Where an order holds both — $24 of cupcakes and a cake nobody has priced — the
figure reads "So far" rather than "Total", everywhere it appears.

### Flavours, sizes and other variants

A cake is not one thing. It is chocolate, or carrot, or red velvet, and it might
come in one layer or three — and none of those are the same price.

Turn on **This is sold in variants** on the product form and you are asked two
kinds of thing:

1. **Variants and their options.** "Flavour": chocolate, carrot, lemon.
   "Layers": one, three. Up to five variants, and what each is *called* is a
   field, so a cake offers a flavour and a tin offers a size.
2. **A price for every combination**, in a grid generated from the options.
   "Chocolate · Three layers" costs whatever you decide it costs. There is no
   base price with a per-layer surcharge, because a formula would make the one
   thing you actually want to say the one thing you could not.

Leave a row of the grid blank and that combination is one you do not make: the
picker greys it out and nobody can order a three layer lemon you have never
baked. (Not on a product priced on request, which has no prices to leave blank.
See **Price on request** above.) A product with a single variant stores no option groups at all — the
variant's name is `variant_label` and its options are the `product_variants`
rows themselves, which is how every product worked before a second variant was
possible and how most of them will keep working. `optionGroups` in
`lib/pricing.ts` is the only place that difference is handled; everything above
it sees a list of variants either way.

The form says **Variant** and **Options** over the boxes. The schema and the
tables say option group and option, because `variants` already means a priced
combination everywhere under the form, down to `product_variants`.

A few things worth knowing:

- **A photo and extra allergens live on the option, not the combination.** The
  walnuts are in the carrot cake at one layer and at three, so you tick them
  once. A nine-row grid should not ask for the same photo nine times.
- **Anything can sell out on its own.** Switching off "Carrot" takes every
  carrot combination with it. A product with nothing left to buy reads as sold
  out and the shop card says so.
- **"Minimum per order" counts the product, not the flavour.** A minimum of six
  cupcakes is met by three chocolate and three vanilla, so it is checked against
  the basket rather than against either line.
- **A bundle price buys that many of one combination.** "4 for $12" is four
  chocolate, not a mixed box, so it is a bigger discount on a dearer flavour
  than on a cheaper one. The admin's price preview shows the answer per
  combination before you save, which is the point of it.
- **Orders keep the flavour they named.** `order_items` snapshots the name the
  same way it snapshots the product's, so renaming, repricing or deleting a
  combination never rewrites an order that has already been placed. This is also
  why a save updates rows in place rather than replacing them.
- **Turning the switch off removes every variant**, and the form says so in red,
  naming them, before you save. That is the only way to get there: a save that
  would drop a variant nobody listed is refused outright, because an empty
  submission is also what a form that has gone wrong sends.

The stand-in catalogue used without a database has one product that offers two
variants — the celebration cake in `lib/demo-data.ts`, walnuts on the carrot
and no three layer lemon — so the picker, the greying-out and the price grid can
all be seen on a fresh clone with no Supabase project at all.

### The time they would like it

The calendar books a **day**. Under it there is one optional field asking
roughly what time, because every order used to mean "some time in the window"
and the answer came back by email one customer at a time.

It is a request, not a booking. Capacity still counts orders per day and never
times, nothing locks a slot, and the time is never checked against your pickup
window — that window is prose you typed in the admin and there is nothing here
to check against. The form shows it beside the field so nobody asks for nine in
the morning on a day you open at four, and you confirm a time when you confirm
the order. An empty answer is a real answer and most orders give it.

Every place it is rendered says "around", worded once in `formatDateLongWithTime`
so the hedge cannot drift apart.
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

### Keeping bots out

There is no captcha. A customer buying cupcakes should not have to identify
traffic lights, so everything here is invisible and layered instead, cheapest
check first:

1. **A honeypot field** on the order form, positioned off-screen rather than
   `display: none`, which some bots know to skip. Anything typed into it is a
   bot, and the submission is refused.
2. **A floor on how fast the form can be filled in** (`MIN_FORM_FILL_MS`). Zero
   means the form never finished mounting — a browser with JavaScript off, not a
   bot — so that case fails open and leans on the honeypot instead.
3. **A per-address attempt limit** (`lib/rate-limit.ts`), ten in a quarter of an
   hour. This is the one that catches what the first two miss, because it counts
   *attempts* rather than orders: a submission refused for a bad email or a full
   date writes no row, so the older `orders`-based brake never saw it. It runs
   before the body is parsed and well before a photo reaches the bucket, so a
   script cannot make the server do expensive work for free.
4. **The `orders` brake itself**, three placed orders per address per fifteen
   minutes, still enforced inside `place_order`.

Sign-in is counted the same way, per address, and the count is cleared the
moment the right password arrives — so a script working a word list from one
machine runs out, while the owner mistyping their password twice never notices
a limit exists. Deliberately *not* counted per account: there is one account on
the whole system, so an account-keyed counter would let anyone lock the owner
out of their own shop.

The limiter fails open everywhere. A null address (local development, a proxy
that strips the header) and a database that will not answer both let the request
through, loudly logged. A broken limiter must never be able to close the shop.

What this does not do: a server action's own code runs only after the request
body has been received and parsed, so a caller posting megabytes of photos still
costs the bandwidth even when the attempt is then refused. Everything after that
point — the storage writes, the RPC, the emails — is behind the limit.

Cross-site submission is handled by Next itself, which compares `Origin` against
`Host` on every server action. There is also a Content Security Policy in
`next.config.ts`; it is a backstop behind input validation rather than a
substitute for it.

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

### The Instagram feed

The band under "Kind words" is the last twelve Instagram posts. It is a **copy**,
not an embed: a nightly job downloads the pictures into a Supabase bucket and
writes a row each, and the page reads those rows like any other table.

That shape is not an optimisation, it is the only one that works:

- The `media_url` the API returns is a signed CDN link that stops resolving
  after a few days. It cannot be stored and handed to a browser later.
- The access token expires every sixty days and has to be traded for a new one,
  which is a write. A page render is the wrong place to do a write, and an
  environment variable cannot be rewritten without a redeploy.
- An embed script or an iframe would tell Meta who reads the site. Nothing else
  on these pages does that, so this does not either.

There is no widget, no third-party script, and no cost.

#### Turning it on

1. The account has to be **Professional** (Business or Creator). Free, and it is
   a toggle in the Instagram app under Settings → Account type.
2. At [developers.facebook.com](https://developers.facebook.com), create an app
   with the **Manage messaging & content on Instagram** use case, then open
   **Instagram API → API setup with Instagram login**.

   Two wrong turns on that screen. The *Embed Facebook, Instagram and Threads
   content in other websites* use case is oEmbed: it describes what we are
   doing, needs App Review, and cannot serve a feed. And the Basic Display API,
   which most tutorials still online are written against, was shut down on
   4 December 2024.

3. **Assign the Instagram Tester role before anything else**, in the app's
   **Roles** tab, then accept the invitation from the Instagram account itself
   under Settings → Apps and websites → Tester invites.

   This is the step that looks optional and is not. Skip it and "Add account"
   opens a popup that lands on an ordinary Instagram feed with no consent
   screen, which reads exactly like a broken button.

   Being a tester is also what makes App Review unnecessary. The panel warns
   that review is required "before your app can access live data"; live data
   means accounts with no role on the app. Leave the app **Unpublished**.

4. Back in **API setup with Instagram login**, add the permissions it asks for
   and press **Add account**. Only `instagram_business_basic` is ever used, and
   the messaging and publishing ones come as a set and sit unused.

   The token this generates has been long-lived in practice. There is no need
   to exchange it by hand unless a call rejects it within the hour.

5. Put it in `INSTAGRAM_ACCESS_TOKEN`, locally and in the Vercel project. A
   Vercel variable only takes effect on a **new deployment**, so redeploy after
   adding it or the sync answers `"skipped":"no Instagram access token"`.

6. Trigger a first sync rather than waiting for 04:00:

   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://vvbakes.co.nz/api/cron/instagram
   ```

   In PowerShell that line fails twice over: `curl` is an alias for
   `Invoke-WebRequest`, which will not take a string header, and there is no
   `grep` to read the secret with. Use the real curl and read `.env.local`
   the PowerShell way:

   ```powershell
   $secret = ((Get-Content .env.local | Where-Object { $_ -match '^CRON_SECRET=' }) -replace '^CRON_SECRET=','' -replace '"','').Trim()
   curl.exe -s -H "Authorization: Bearer $secret" https://vvbakes.co.nz/api/cron/instagram
   ```

   `unauthorized` here almost always means the `CRON_SECRET` in `.env.local` is
   not the one in the Vercel project. They are set at different times and drift.
   Hitting `/api/cron/keepalive` with the same secret tells you which it is: that
   route has been live for longer, so if it refuses too, the secrets differ
   rather than this route being broken.

   The first run downloads twelve pictures and is the slow one. After that it is
   usually one. The response says what happened: `stored`, `downloaded`,
   `pruned`, `refreshed`, and `problems` if anything went wrong.

`INSTAGRAM_ACCESS_TOKEN` is only a **seed**. The first run copies it into
`instagram_sync` and every run after that refreshes it there, so once the site
has synced once, editing the environment variable does nothing. To replace a
token that has genuinely died, clear the stored one first:

```sql
update instagram_sync set access_token = null, token_expires_at = null where id = 1;
```

#### When it breaks

It breaks quietly. A dead token does not empty the page, it leaves last
month's posts sitting there looking fine. So the job writes what went wrong to
`instagram_sync.last_error` and when it last succeeded to `synced_at`:

```sql
select synced_at, token_expires_at, refreshed_at, last_error from instagram_sync;
```

`access_token` is deliberately not in that list. The table has row level
security on and **no policies at all**, so only the service role can read it;
there is no path from a signed-in browser session to the credential.

A refresh needs a token at least 24 hours old and not yet expired. The job asks
for a new one once there are fewer than ten days left, which lands around day
fifty and leaves a week of nightly retries. Miss that window entirely (the site
offline for two months, say) and the token is gone for good; generate a new one
and clear the stored one as above.

Two other things worth knowing:

- Posts are pruned to the latest twelve, pictures and all, so the bucket does
  not grow forever. Deleting a post on Instagram removes it here on the next run.
- The API version is pinned in `lib/instagram.ts` (`API_VERSION`). Meta supports
  each version about two years; bump it deliberately after reading the changelog
  rather than waiting for calls to start failing.

---

## Being found

The shop sells cakes in Auckland, so the queries worth ranking for are the
local ones: "custom cakes Auckland", "birthday cake Flat Bush", "Indonesian
cake Auckland". Everything below exists to answer those, and nothing below is
worth anything until `SEARCH_INDEXING` is flipped. See the launch checklist at
the bottom of this section.

### Where the city comes from

`lib/seo.ts` holds it. The suburb stays in settings, where the owner changes
it; the city, the region and the country are constants there, because moving
the business to another city is not a settings change.

`localityLine()` is the one function to reach for when a page needs to print
where the shop is. The suburb is typed by hand and the admin's own placeholder
suggests "Mt Roskill, Auckland", so plenty of real answers already carry the
city and appending it again gives "Auckland, Auckland". The live setting is
"Flat Bush, Auckland" and reads correctly through it.

`postalAddress()` does the opposite job, splitting the same setting across
`addressLocality` and `addressRegion`, which are different fields and must not
repeat each other.

### What each page says about itself

| Page | Title | Why |
| --- | --- | --- |
| `/` | vvbakes \| inspired desserts | The brand line, kept at the client's request. Inherited from the root layout's `title.default`, so the page sets no title of its own. See the note below. |
| `/shop` | Cake & Bakery Menu in Auckland \| vvbakes | "Shop" alone is a nav label, not a title. |
| `/shop/[slug]` | *Product* \| Auckland \| vvbakes | A product name plus a place is the whole query. |
| `/order` | Your order \| vvbakes | A form, not a search result. Only the description carries the city. |

Descriptions all name the city. `keywords` is deliberately absent: Google has
ignored the meta keywords tag since 2009 and filling it in signals nothing but
the age of the advice that put it there.

**On the home page's title.** A keyword-led title would be the stronger play
for "custom cakes Auckland", and the brand line was kept anyway. That is a
decision, not an oversight, and it costs less than it looks: `/shop` and the
product pages are the better landing pages for somebody shopping and both of
those lead with what they sell and where, Google rewrites a title it judges
unhelpful for the query (often from the H1 and visible copy, which here say
"Sweet treats, made in Flat Bush, Auckland"), and for the brand query itself
the brand line is exactly right. If the home page ever needs to fight harder
for a generic query, change the H1, not the title.

Every page declares its own `alternates.canonical`. That has to be per page:
Next inherits `alternates` wholesale, so one on the root layout would make
every page claim to be `/`.

### Structured data

Rendered through `components/site/JsonLd.tsx`, which escapes `<` in the
serialised JSON. Every one of these blocks is built from admin-editable text, so
a product name holding a closing script tag would otherwise end the script early.

| Node | Page | What it buys |
| --- | --- | --- |
| `Bakery` | `/` | The business, its address, `areaServed` across Auckland, `priceRange` derived from the real catalogue, and an `OrderAction` while orders are open. Carries `@id` = `<site>/#bakery`. |
| `FAQPage` | `/` | The questions already on the page. |
| `ItemList` | `/shop` | The menu in the order it is scrolled, flattened across the category bands. |
| `Product` | `/shop/[slug]` | Name, photos, category, and an offer. This is the one that can put a price and a stock state in the result instead of a blue link. |
| `BreadcrumbList` | `/shop/[slug]` | The trail Google prints in place of the bare URL. |

The product pages' `offers.seller` points at the bakery's `@id`, so a crawler
reads one business across the site rather than inventing one per page.

Three things the markup deliberately does **not** claim:

- **No price for a product priced on request.** `unitPriceCents` holds a
  placeholder the product page itself refuses to show, and publishing it would
  quote Google a number the shop will not honour. A product with a price guide
  publishes its floor as `AggregateOffer.lowPrice` and no ceiling, which is
  exactly what the page says in words. See `offerPrices()` in `lib/seo.ts`.
- **No opening hours.** The availability calendar is about which days there is
  capacity to bake, which is a different claim from "the shop is open 9 to 5",
  and the pickup window is free text. Neither is a promise to publish.
- **No street address.** This is a home kitchen. The pickup address goes out in
  the confirmation email to the person who ordered; a locality, a region and a
  country place the business in the right city without putting a home address
  on every page.

There is also no `AggregateRating` and no `Review` markup, although the home
page has real reviews on it. Ratings are not collected, and inventing star
values to fill the field is against Google's guidelines and would be a lie
besides. Self-serving reviews on a business's own site are ineligible for rich
results anyway, so the markup would cost honesty and buy nothing.

`FAQPage` is worth being honest about too: Google narrowed FAQ rich results to
government and health sites in 2023, so it will not draw an accordion under the
listing. It is still read by Bing and by the assistants that answer from
structured data, and it costs one script tag over answers that already exist.

### Crawling

`app/robots.ts` disallows `/admin`, `/menu` (the unlisted market card) and
`/order/` (private to whoever holds the link) and points at the sitemap.
`app/sitemap.ts` lists the home page, the shop, the order form and every
product, with terms and privacy ranked last.

Note that robots.txt keeps letting crawlers **in** before launch. A
`Disallow: /` would stop them fetching the pages at all, so they would never
read the `noindex` tag, and bare URLs could still surface. Blocking the crawl
and blocking the listing are different things.

### Checking it

`lib/seo.test.ts` covers the builders: the suburb handling, the offer rules
including every price-on-request case, and the promises above about what is not
published.

To see what a page actually emits, fetch it and parse the blocks out:

```bash
curl -s http://localhost:3000/shop/custom-cake | grep -o '<script type="application/ld+json">[^<]*' | sed 's/^.*json">//'
```

Paste the result into Google's Rich Results Test. Do that against the deployed
site rather than localhost once the domain is live, since half the URLs in the
markup are absolute.

### The launch checklist

1. Flip `SEARCH_INDEXING` to `true` in `lib/constants.ts`. Every page carries
   `noindex, nofollow` until you do, and none of the above counts for anything.
2. Confirm `NEXT_PUBLIC_SITE_URL` is the real domain. Every absolute URL in the
   structured data and the sitemap is built from it.
3. Verify the domain in Google Search Console and submit `/sitemap.xml`.
4. Create a Google Business Profile. For a local business this outranks
   everything on this page put together: the map pack is a different index, and
   `Bakery` markup supports a profile rather than replacing one.
5. Run the Rich Results Test over `/`, `/shop` and two product pages, one
   ordinary and one priced on request.

---

## Verifying it works

Start with `npm run check`, which covers the whole setup: keys, tables, seed
data, the owner account, the security boundary, storage and email. Then:

```bash
npm test          # migrations, RLS policies, pricing, availability,
                  # analytics redaction, and that `npm run check` still
                  # knows about every table and function
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

**The catalogue.** `/shop` should show three bands with six products: the five
off the market menu, priced "$3 each · 4 for $12", "$5 / pack", "$5 / slice" and
"$3 / slice", plus the custom cake, which quotes no price but lists what its sizes
start at and offers a size to choose. Toggle a product to sold out in the admin and reload, the badge should
appear.

**An order.** Add five cupcakes and two packs of cookies; the total should be
exactly `$25.00`, and the cupcake line should read
`1 x 4 for $12.00 + 1 x $3.00 each`.
Submit it, then check that you got the notification email and the customer got
the acknowledgement.

**A cake with a picture.** Open `/shop/custom-cake`, pick a size, attach two
photos and a Pinterest link, and add it to the order alongside a box of
cupcakes. The basket should show the brief under that line and a total that
reads "So far", because the cake has no price yet. Submit it. The photos should
appear in the admin next to the price box, in your notification email and on the
customer's order page, and the link should open. Set a price on the order and
the total should become a total, everywhere at once.

Then try `javascript:alert(1)` in the link field; the form should refuse it.

**An extra.** Add candles to a product in the admin, order two of that product
with the candles ticked, and check the line reads two sets rather than one.
Delete the extra while the basket is still open and reload the order form: the
extra should come off, the page should say so, and the cake should still be
there.

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
  api/cron/      the daily keep-alive, which also sweeps spent rate-limit rows
  api/webhooks/  what Resend says about an email after it accepted it
components/
  ui/            buttons, fields, the arch photo frame, the hairline list
  site/          header, footer, product cards
  order/         the order form and its parts
  admin/         the admin's own components
emails/          the five transactional emails
lib/             pricing, availability, dates, Supabase clients, validation
scripts/         setup check, icon build, email preview and test send
supabase/        migrations and the seed
tests/           SQL run against a real Postgres, in-process
proxy.ts         refreshes the owner's session, /admin only
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
- **Switch the shop on in search.** `SEARCH_INDEXING` in `lib/constants.ts` is
  still `false`, so every page carries `noindex`. Flip it and deploy to launch,
  then work through the rest of the checklist at the end of [Being
  found](#being-found): Search Console, the sitemap, and a Google Business
  Profile, which for a local bakery is worth more than everything on that page
  put together.
