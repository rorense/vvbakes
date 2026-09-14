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
