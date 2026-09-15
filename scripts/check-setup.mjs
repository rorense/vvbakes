/**
 * Checks that Supabase is wired up correctly.
 *
 *   node scripts/check-setup.mjs
 *
 * Reads .env.local and works through everything in order: are the keys present
 * and shaped right, do they reach the project, are the tables and seed data
 * there, is the owner account set up, and is the security boundary actually
 * holding. Every check says what to do about it when it fails.
 *
 * It never prints a key. Only whether one is present and whether it works.
 */
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const RESET = "[0m";
const paint = (code, text) => `[${code}m${text}${RESET}`;
const pass = (t) => paint(32, t);
const fail = (t) => paint(31, t);
const warn = (t) => paint(33, t);
const dim = (t) => paint(90, t);

let failures = 0;
let warnings = 0;

function report(ok, label, detail) {
	if (ok === true) {
		console.log(`${pass("  ok  ")} ${label}`);
	} else if (ok === "warn") {
		warnings += 1;
		console.log(`${warn(" note ")} ${label}`);
		if (detail) console.log(dim(`        ${detail}`));
	} else {
		failures += 1;
		console.log(`${fail(" fail ")} ${label}`);
		if (detail) console.log(dim(`        ${detail}`));
	}
}

// --- environment ------------------------------------------------------------

async function loadEnv() {
	try {
		const raw = await readFile(".env.local", "utf8");
		for (const line of raw.split("\n")) {
			const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
			if (!match) continue;
			const [, key, rawValue] = match;
			if (process.env[key]) continue;
			process.env[key] = rawValue.replace(/^["']|["']$/g, "");
		}
		return true;
	} catch {
		return false;
	}
}

console.log("\nChecking your Supabase setup\n");

const hasEnvFile = await loadEnv();
report(hasEnvFile, ".env.local exists", "Copy .env.example to .env.local and fill it in.");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const looksLikePlaceholder = (value) => !value || value.includes("xxxxxxxx") || value.trim() === "";

report(
	!looksLikePlaceholder(url) && /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url ?? ""),
	"NEXT_PUBLIC_SUPABASE_URL is set",
	"Project Settings > API Keys > Project URL. Looks like https://abcdefgh.supabase.co",
);

report(
	!looksLikePlaceholder(anonKey),
	"NEXT_PUBLIC_SUPABASE_ANON_KEY is set",
	"Project Settings > API Keys > the Publishable key (sb_publishable_...).\n" +
		"        Older projects call this the anon / public key. Safe to expose to browsers.",
);

report(
	!looksLikePlaceholder(serviceKey),
	"SUPABASE_SERVICE_ROLE_KEY is set",
	"Project Settings > API Keys > the Secret key (sb_secret_...).\n" +
		"        Older projects call this the service_role key.\n" +
		"        Never put this one in a NEXT_PUBLIC_ variable.",
);

if (anonKey && serviceKey && anonKey === serviceKey) {
	report(false, "The two keys are different", "You've pasted the same key twice.");
}

// The likeliest mistake, and it fails later in a confusing way.
if (serviceKey?.startsWith("sb_publishable_")) {
	report(
		false,
		"SUPABASE_SERVICE_ROLE_KEY is the secret key",
		"That is the publishable key. The secret one starts sb_secret_ and is revealed behind a click.",
	);
}
if (anonKey?.startsWith("sb_secret_")) {
	report(
		false,
		"NEXT_PUBLIC_SUPABASE_ANON_KEY is the publishable key",
		"That is the secret key, and NEXT_PUBLIC_ variables are sent to every browser. Swap them.",
	);
}

if (failures > 0) {
	console.log(`\n${fail("Fix the above first, then run this again.")}\n`);
	process.exit(1);
}

// --- connection -------------------------------------------------------------

const anon = createClient(url, anonKey, { auth: { persistSession: false } });
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

console.log();

const settings = await anon.from("site_settings").select("*").eq("id", 1).maybeSingle();

if (settings.error) {
	const message = settings.error.message ?? "";
	if (message.includes("Invalid API key") || settings.error.code === "PGRST301") {
		report(false, "The anon key reaches the project", "That key was rejected. Copy it again.");
	} else if (message.includes("does not exist") || settings.error.code === "42P01") {
		report(
			false,
			"The tables exist",
			"Run `npx supabase db push` to create them, then run supabase/seed.sql.",
		);
	} else {
		report(false, "The anon key reaches the project", message);
	}
	console.log(`\n${fail("Fix the above first, then run this again.")}\n`);
	process.exit(1);
}

report(true, "The anon key reaches the project");
report(
	settings.data !== null,
	"The settings row exists",
	"Run supabase/seed.sql in the SQL Editor.",
);

// --- schema and seed --------------------------------------------------------

/**
 * Every table the site reads or writes.
 *
 * Checked through the service key, which bypasses row level security, so an
 * error here means the table genuinely is not there rather than that the caller
 * was not allowed to see it.
 *
 * This list is the whole point of the section. The reads below it only touch
 * the handful of tables that existed when this script was written, so a project
 * missing everything added since — variants, questions, reviews, rate limits —
 * used to pass every check and then fall over on the first page load.
 */
const TABLES = [
	"admins",
	"categories",
	"products",
	"product_price_tiers",
	"product_variants",
	"faqs",
	"reviews",
	"site_settings",
	"site_settings_private",
	"availability_rules",
	"availability_overrides",
	"orders",
	"order_items",
	"order_events",
	"rate_limits",
];

const missingTables = [];
for (const table of TABLES) {
	// `limit(0)` rather than `{ head: true }`: a HEAD request for a table that
	// does not exist comes back 204 with no error attached, so the obvious way to
	// write this silently passes on exactly the thing it is here to catch. A GET
	// that asks for no rows transfers just as little and returns a real 404.
	const probe = await admin.from(table).select("*").limit(0);
	if (probe.error) missingTables.push(table);
}

report(
	missingTables.length === 0,
	`Every table is there ${dim(`(${TABLES.length} checked)`)}`,
	`Missing: ${missingTables.join(", ")}.\n` +
		"        Run `npx supabase db push`. A migration has not been applied.",
);

/**
 * The functions, probed with arguments that do nothing.
 *
 * An empty id array renumbers no rows, a sweep only removes rate-limit rows
 * that have already expired, and clearing a bucket nothing has ever written to
 * deletes nothing. `record_attempt` is deliberately not called: it is the one
 * that writes, and it ships in the same migration as the two beside it.
 */
const FUNCTIONS = [
	["is_admin", {}],
	["order_counts_between", { p_from: "2020-01-01", p_to: "2020-01-02" }],
	["reorder_products", { p_ids: [] }],
	["reorder_categories", { p_ids: [] }],
	["sweep_rate_limits", {}],
	["clear_attempts", { p_bucket: "setup-probe", p_key: "setup-probe" }],
];

const missingFunctions = [];
for (const [name, args] of FUNCTIONS) {
	const probe = await admin.rpc(name, args);
	// Only "no such function" counts. Anything else is a live function that did
	// not like being handed nothing, which is not what is being asked here.
	if (probe.error?.code === "PGRST202" || probe.error?.message?.includes("does not exist")) {
		missingFunctions.push(name);
	}
}

report(
	missingFunctions.length === 0,
	`Every database function is installed ${dim(`(${FUNCTIONS.length} checked)`)}`,
	`Missing: ${missingFunctions.join(", ")}.\n` +
		"        Run `npx supabase db push`. A migration has not been applied.",
);

const categories = await anon.from("categories").select("id");
report(
	(categories.data?.length ?? 0) > 0,
	`Categories are seeded ${dim(`(${categories.data?.length ?? 0} found)`)}`,
	"Run supabase/seed.sql in the SQL Editor.",
);

// The shop reads products and their variants as one joined select, so a missing
// or unreadable product_variants does not degrade the page — it empties it.
const variants = await anon
	.from("products")
	.select("slug, product_price_tiers (qty), product_variants (id)")
	.limit(1);
report(
	!variants.error,
	"Products can be read with their prices and variants",
	`${variants.error?.message ?? ""}\n` +
		"        The shop reads all three as one query, so this failing empties the\n" +
		"        whole catalogue rather than dropping a flavour.",
);

// Both are legitimately empty on a new shop; what matters is that the public can
// read them at all, since the home page drops the section rather than erroring.
for (const [table, what] of [
	["faqs", "questions"],
	["reviews", "reviews"],
]) {
	const probe = await anon.from(table).select("id");
	report(
		!probe.error,
		`The ${what} can be read publicly ${dim(`(${probe.data?.length ?? 0} found)`)}`,
		probe.error?.message,
	);
}

const products = await anon.from("products").select("slug");
report(!products.error, "Products can be read publicly", products.error?.message);
report(
	(products.data?.length ?? 0) > 0,
	`Products are seeded ${dim(`(${products.data?.length ?? 0} found)`)}`,
	"Run supabase/seed.sql in the SQL Editor.",
);

const rules = await anon.from("availability_rules").select("weekday");
report(
	rules.data?.length === 7,
	`Seven weekday rules exist ${dim(`(${rules.data?.length ?? 0} found)`)}`,
	"Run supabase/seed.sql in the SQL Editor.",
);

const counts = await anon.rpc("order_counts_between", {
	p_from: "2020-01-01",
	p_to: "2020-01-02",
});
report(!counts.error, "The availability function is installed", counts.error?.message);

// --- the security boundary --------------------------------------------------

console.log();

const anonOrders = await anon.from("orders").select("id").limit(1);
report(
	!anonOrders.error && anonOrders.data?.length === 0,
	"Orders are hidden from the public key",
	anonOrders.error
		? anonOrders.error.message
		: "The anon key can read orders. Check that the row level security migration ran.",
);

const anonBank = await anon.from("site_settings_private").select("id").limit(1);
report(
	!anonBank.error && anonBank.data?.length === 0,
	"Bank details are hidden from the public key",
	anonBank.error
		? anonBank.error.message
		: "The anon key can read private settings. Check that the row level security migration ran.",
);

const anonPlace = await anon.rpc("place_order", {
	p_items: [],
	p_pickup_date: "2020-01-01",
	p_fulfilment: "pickup",
	p_customer_name: "check",
	p_customer_email: "check@example.com",
	p_customer_phone: "0",
	p_delivery_address: null,
	p_notes: null,
	p_custom_request: null,
	p_ip_hash: null,
});
report(
	Boolean(anonPlace.error),
	"The public key cannot place orders directly",
	"place_order should be refused for anon. Re-run the functions migration.",
);

// Reordering is `security invoker`, so row level security would stop a stranger
// actually moving anything — but execute was granted to PUBLIC once, and anon
// inherits PUBLIC, so it was callable by anyone until that was revoked. Worth
// checking, because nothing about the site looks different when it regresses.
for (const name of ["reorder_products", "reorder_categories"]) {
	const probe = await anon.rpc(name, { p_ids: [] });
	report(
		Boolean(probe.error),
		`The public key cannot call ${name}`,
		`${name} should be refused for anon. Re-run the reorder grants migration.`,
	);
}

// The attempt counter is what stands between the order form and a bot. It fails
// open by design, so if anon could empty it, the brake would come off silently.
// Keyed on (bucket, key); there is no id column to ask for.
const anonRateLimits = await anon.from("rate_limits").select("bucket").limit(1);
report(
	!anonRateLimits.error && anonRateLimits.data?.length === 0,
	"Rate limit rows are hidden from the public key",
	anonRateLimits.error
		? anonRateLimits.error.message
		: "The anon key can read rate limits. Check that the rate limit migration ran.",
);

const anonClear = await anon.rpc("clear_attempts", {
	p_bucket: "setup-probe",
	p_key: "setup-probe",
});
report(
	Boolean(anonClear.error),
	"The public key cannot clear rate limit attempts",
	"clear_attempts should be refused for anon, or the spam brake can be reset at will.",
);

const adminOrders = await admin.from("orders").select("id").limit(1);
report(
	!adminOrders.error,
	"The service key can read orders",
	adminOrders.error?.message ??
		"That key was rejected. Make sure it is the service_role key, not the anon one.",
);

// --- the owner account ------------------------------------------------------

console.log();

const admins = await admin.from("admins").select("user_id");
const adminCount = admins.data?.length ?? 0;
report(
	adminCount > 0,
	`An owner account is set up ${dim(`(${adminCount} found)`)}`,
	"Create a user under Authentication > Users, then run:\n" +
		"        insert into admins (user_id) values ('the-user-id');",
);

if (adminCount > 1) {
	report("warn", `${adminCount} accounts can reach the admin`, "Expected just one.");
}

const users = await admin.auth.admin.listUsers();
if (!users.error) {
	const adminIds = new Set((admins.data ?? []).map((row) => row.user_id));
	const orphans = (admins.data ?? []).filter(
		(row) => !users.data.users.some((user) => user.id === row.user_id),
	);
	report(
		orphans.length === 0,
		"Every owner row points at a real user",
		"An admins row references a user that no longer exists. Delete that row.",
	);

	const unconfirmed = users.data.users.filter(
		(user) => adminIds.has(user.id) && !user.email_confirmed_at,
	);
	report(
		unconfirmed.length === 0,
		"The owner account is confirmed",
		"Confirm the account in Authentication > Users, or you won't be able to sign in.",
	);
}

// The only way to know whether sign-ups are open is to try one.
const probeEmail = `signup-probe-${Date.now()}@example.invalid`;
const signUp = await anon.auth.signUp({
	email: probeEmail,
	password: crypto.randomUUID(),
});

if (signUp.error) {
	report(true, "Public sign-ups are disabled");
} else {
	report(
		"warn",
		"Public sign-ups are still enabled",
		"Turn off Authentication > Sign In / Providers > 'Allow new users to sign up'.\n" +
			"        Nobody can reach the admin without an `admins` row, but there is no reason to leave it open.\n" +
			`        A test account was just created (${probeEmail}), delete it under Authentication > Users.`,
	);
}

// --- storage ----------------------------------------------------------------

console.log();

const buckets = await admin.storage.listBuckets();
const productBucket = buckets.data?.find((bucket) => bucket.id === "product-images");
report(
	Boolean(productBucket),
	"The product image bucket exists",
	"Run `npx supabase db push`, the storage migration creates it.",
);
if (productBucket) {
	report(
		productBucket.public === true,
		"The image bucket is public",
		"Product photos are shown on the shop, so the bucket needs to be public.",
	);
}

const inspirationBucket = buckets.data?.find((bucket) => bucket.id === "order-inspiration");
report(
	Boolean(inspirationBucket),
	"The inspiration photo bucket exists",
	"Run `npx supabase db push`, the inspiration storage migration creates it.",
);
if (inspirationBucket) {
	report(
		inspirationBucket.public === true,
		"The inspiration bucket is public",
		"The photos are shown in the admin and in your notification email, both of\n" +
			"        which need a URL that does not expire. The paths are unguessable.",
	);
}

// --- email ------------------------------------------------------------------

console.log();

const resendKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM;

report(
	resendKey && emailFrom && !emailFrom.includes("yourdomain") ? true : "warn",
	"Email is configured",
	"Not fatal, the site works, but no order emails will be sent.\n" +
		"        See the README under 'Email' for the Resend setup.",
);

if (resendKey && !resendKey.startsWith("re_")) {
	report(
		"warn",
		"RESEND_API_KEY does not look like a Resend key",
		"They start re_. Copy it again from Resend > API Keys.",
	);
}

// The likeliest mistake once a domain exists is sending as the mailbox you read.
// Resend refuses it, and without this the first real order is where you find out.
const FREE_MAIL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"];
const fromAddress = emailFrom?.match(/<([^>]+)>/)?.[1] ?? emailFrom ?? "";
const fromDomain = fromAddress.split("@")[1]?.trim().toLowerCase();

if (fromDomain && FREE_MAIL.includes(fromDomain)) {
	report(
		"warn",
		`EMAIL_FROM sends as ${fromDomain}`,
		"Resend only sends from a domain verified with it, which a free mailbox\n" +
			"        cannot be. Send from your own domain and put this address in the\n" +
			"        admin as the contact email instead, so replies still reach it.",
	);
}

report(
	process.env.RESEND_WEBHOOK_SECRET?.startsWith("whsec_") ? true : "warn",
	"RESEND_WEBHOOK_SECRET is set",
	"Only needed in production, and only for bounces. Without it an order whose\n" +
		"        email never arrived still reads as sent. Resend > Webhooks.",
);

report(
	process.env.CRON_SECRET ? true : "warn",
	"CRON_SECRET is set",
	"Only needed in production, where it protects the daily keep-alive.",
);

// --- summary ----------------------------------------------------------------

console.log();
if (failures > 0) {
	console.log(fail(`${failures} thing${failures === 1 ? "" : "s"} still need fixing.\n`));
	process.exit(1);
}
if (warnings > 0) {
	console.log(pass("Everything essential is working."));
	console.log(
		dim(`${warnings} note${warnings === 1 ? "" : "s"} above, worth reading, not blocking.\n`),
	);
} else {
	console.log(pass("Everything is set up correctly.\n"));
}
