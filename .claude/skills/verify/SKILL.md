---
name: verify
description: Run vvbakes in demo mode from a scratchpad copy and drive the change in the browser pane, without touching the shared checkout or its dev server.
---

# Verifying vvbakes at runtime

`.env.local` points at the live Supabase and another session may hold port 3000,
so never run the app from the checkout itself. Run a copy in demo mode.

## Set up

```powershell
$src = "<repo>"; $dst = "<scratchpad>\site"
robocopy $src $dst /E /XD "$src\node_modules" "$src\.next" "$src\.git" "$src\.claude" "$src\supabase" "$src\.email-preview" /XF "*.tsbuildinfo" ".env.local" ".env"
New-Item -ItemType Junction -Path "$dst\node_modules" -Target "$src\node_modules"
```

- Exclude the root `supabase` dir by **full path**. A bare `/XD supabase` also drops
  `lib/supabase` and every page 500s with "Can't resolve './supabase/public'".
- Run `next dev --webpack` (Turbopack rejects the junctioned `node_modules`).
  A `node` wrapper in the scratchpad that spawns
  `node_modules/next/dist/bin/next dev --webpack -p 3017` with `cwd` set to the copy works.
- `preview_start` only reads `.claude/launch.json` in the checkout: add a temporary
  entry, start it, then remove the entry **by name** and run
  `npx prettier --write --ignore-path .gitignore .claude/launch.json` (the repo's
  `.prettierignore` skips `.claude/`) so the file is byte-identical again.

## Scenarios worth staging in the copy's `lib/demo-data.ts`

- Every option of one group switched off: a product sold out by its options only
  (`isOrderable` false while `isAvailable` is true).
- `mixVariants: false` on the minis: reaches the single-selection quote path.
- `deliveryEnabled: true`, `deliveryFeeCents: 500`: the order form's fee.
- A dead database: `.env.local` in the copy with `NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:9"`
  and dummy keys. Pages that read settings answer 500; the log shows the cause.

## Driving

- Admin pages need a login. For the product editor, add a throwaway
  `app/verify-form/page.tsx` **to the copy** rendering `ProductForm` with
  `DEMO_PRODUCTS` inside `ToastProvider`, then read the hidden `variants`,
  `optionGroups` and `removedVariants` inputs.
- Emails: `npx tsx scripts/preview-emails.mts` in the copy writes 24 previews.
  Render the same from `git archive <base>` and `diff -rq` the two folders.
- The basket lives in `localStorage["vvbakes:cart"]` and loads after hydration.
  Read the DOM a second or two after navigating, not the first screenshot.
- The pane often screenshots blank or stale while hidden. Trust DOM reads, and use
  `form_input` with refs instead of coordinate clicks.

## Tear down

Delete each junction with `[System.IO.Directory]::Delete($p, $false)` **before**
removing the copy, then `robocopy <empty> <copy> /MIR` and `Remove-Item`.
