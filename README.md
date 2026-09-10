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
| `npm test` | Runs the test suite, including real SQL against an in-process Postgres |
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
   closest to your customers — **Sydney** for New Zealand.
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

   The publishable key is meant to be in the browser — row level security is
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
   password. Tick "auto confirm user" so you can sign in immediately.
2. Copy the new user's ID.
3. In the **SQL Editor**, run:

   ```sql
   insert into admins (user_id) values ('paste-the-user-id-here');
   ```

4. **Authentication → Sign In / Providers**, and turn **"Allow new users to
   sign up"** off. Only the account you just made should be able to get in.

Being able to sign in is not the same as being the owner: the site checks for a
row in `admins` as well, so even if sign-ups were somehow left on, a new account
would see nothing.

### 4. Email

The site sends five emails: one to you when an order arrives, and four to the
customer as their order moves along. It sends them over SMTP with a Gmail app
password, which needs no domain and no DNS.

1. Turn on 2-step verification on the Google account you want to send from.
2. Create an app password at
   [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords).
   It is 16 characters. Your normal Google password will not work.
3. Put it in `.env.local`:

   ```
   SMTP_HOST="smtp.gmail.com"
   SMTP_PORT="465"
   SMTP_USER="youraddress@gmail.com"
   SMTP_PASS="the-16-character-app-password"
   EMAIL_FROM="vvbakes <youraddress@gmail.com>"
   ```

4. In the admin, under **Settings → Getting in touch**, set **Send new orders
   to** — that is where you get told about a new order.

Gmail allows about 500 emails a day, which is far more than this needs.

**When you get a domain**, switch to a proper sending service (Resend, Postmark)
and verify the domain, so mail comes from `orders@yourdomain` rather than a
Gmail address. Only `lib/email.ts` needs to change; the templates stay as they
are.

### 5. Deploy

1. Import the repository at [vercel.com](https://vercel.com).
2. Add every variable from `.env.local` under **Settings → Environment
   Variables**, plus:
   - `CRON_SECRET` — any long random string.
   - `NEXT_PUBLIC_SITE_URL` — only once you have a custom domain. Vercel
     supplies its own URL until then.
3. Deploy.

`vercel.json` already schedules a daily request to `/api/cron/keepalive`. A free
Supabase project pauses after seven days without activity, which would take the
shop offline without warning; one read a day prevents that.

---

## How it fits together

### Ordering

A customer builds an order in their browser (kept in `localStorage`, since there
are no accounts), picks a pickup date, and submits. The server hands the whole
thing to a single Postgres function, `place_order`, which:

- re-prices every line from the database, ignoring whatever the browser said;
- checks lead time and the daily cut-off in the bakery's own timezone;
- takes an advisory lock on the pickup date, counts the orders already on it,
  and refuses if the day is full;
- writes the order and its lines in one transaction.

Nothing about a price or a date is trusted from the browser. That matters most
in the case where two people load the last slot at the same time: without the
lock they would both see one space free and both be accepted.

Prices are also computed in the browser so the form can show a running total.
`lib/pricing.ts` and the SQL function are two implementations of the same rule,
so a test runs both across many quantities and tier shapes and fails if they
ever disagree on a single cent.

### Bundle pricing

"4 for $12" is stored as a tier. When someone orders five cupcakes they pay
`$12 + $3`, not `5 × $3`. Where several bundles overlap, the customer gets the
cheapest combination — worked out properly rather than by taking the biggest
bundle first, which overcharges whenever a smaller bundle has a better rate.

Cookies are the other shape: `$2.50` each with a step of `2`, so the shop
advertises "2 for $5" and the form only ever offers even numbers.

### What is private

`orders` has no row-level-security policy for anonymous visitors, and no insert
policy for anybody. Orders are created only through `place_order`, called
server-side. If the public key leaked tomorrow, it would expose the menu and
nothing else — no names, no phone numbers, no addresses.

Bank details and the pickup street address live in a separate table with no
anonymous policy at all. They appear in exactly two places: the confirmation
email, and the customer's own order page once you have confirmed it. They are on
no public page.

The one exception is `/menu`, the card used at physical markets, which still
shows the account number by design. It is `noindex`, absent from the sitemap and
not linked from anywhere.

### The calendar

Two layers. **Your usual week** says which weekdays you bake and how many orders
you can take on each. Individual dates override that — closed for a holiday, or
open with extra capacity for a market. The order form offers only dates that are
open and have room; a date that is full simply is not shown.

Closing a day that already has orders on it does not cancel them. It only stops
new ones, and the admin says so before you save.

---

## Verifying it works

Start with `npm run check`, which covers the whole setup: keys, tables, seed
data, the owner account, the security boundary, storage and email. Then:

```bash
npm test          # migrations, RLS policies, pricing, availability — 98 tests
npm run typecheck
npm run build
```

Then, by hand:

**The catalogue.** `/shop` should show three bands with five products, priced
"$3 each · 4 for $12", "2 for $5", "$5 / slice" and "$3 / slice". Toggle a
product to sold out in the admin and reload — the badge should appear.

**An order.** Add five cupcakes and two cookies; the total should be exactly
`$20.00`, and the cupcake line should read `1 x 4 for $12.00 + 1 x $3.00 each`.
Submit it, then check that you got the notification email and the customer got
the acknowledgement.

**Confirming.** Open the order in the admin and confirm it. The customer's email
should now carry the bank details, the reference and the full pickup address.
The same details should appear on their order page, and not before.

**Capacity.** Set a Saturday's capacity to 1 in the calendar and place two
orders for it. The second should be refused with "That date just filled up".
For the concurrent case:

```bash
node scripts/race-test.mjs 2026-09-19
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
  (site)/        the public site: home, shop, product pages, order form, status page
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

Two pieces of logic exist twice on purpose — pricing and availability, once in
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
