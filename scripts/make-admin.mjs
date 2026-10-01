/**
 * Grants a Supabase user access to the admin.
 *
 *   npm run make-admin -- you@example.com
 *
 * Create the user first, in the dashboard under Authentication > Users, so that
 * you choose the password and nothing else ever sees it. This only does the
 * plumbing afterwards: it finds that user and adds the `admins` row the site
 * checks for.
 *
 * That row is the actual gate. Being able to sign in is not enough, a Supabase
 * account with no row here sees an empty admin and can read nothing, which is
 * what makes leaving sign-ups on merely untidy rather than dangerous.
 *
 * Pass --remove to take access away again.
 */
import { createClient } from "@supabase/supabase-js";

const paint = (code, text) => `[${code}m${text}[0m`;
const pass = (t) => paint(32, t);
const fail = (t) => paint(31, t);
const dim = (t) => paint(90, t);

// Node's own .env parser. Like the one it replaced, it leaves a variable
// that is already set alone.
function loadEnv() {
	try {
		process.loadEnvFile(".env.local");
	} catch {
		// Fall back to the ambient environment.
	}
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
	console.error(
		fail("\nNEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY need to be in .env.local.\n"),
	);
	process.exit(1);
}

const args = process.argv.slice(2);
const remove = args.includes("--remove");
const email = args.find((arg) => !arg.startsWith("--"))?.toLowerCase();

if (!email) {
	console.error(
		`\nUsage: npm run make-admin -- you@example.com\n` +
			dim("       npm run make-admin -- you@example.com --remove\n"),
	);
	process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

// listUsers pages, and an account could be anywhere in it.
let user = null;
for (let page = 1; page <= 20 && !user; page += 1) {
	const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
	if (error) {
		console.error(fail(`\nCould not list users: ${error.message}\n`));
		process.exit(1);
	}
	user = data.users.find((candidate) => candidate.email?.toLowerCase() === email) ?? null;
	if (data.users.length < 200) break;
}

if (!user) {
	console.error(
		fail(`\nNo Supabase user with the address ${email}.\n`) +
			dim(
				"\nCreate one first: Authentication > Users > Add user.\n" +
					'Tick "Auto Confirm User" so you can sign in straight away.\n',
			),
	);
	process.exit(1);
}

if (remove) {
	const { error } = await db.from("admins").delete().eq("user_id", user.id);
	if (error) {
		console.error(fail(`\nCould not remove access: ${error.message}\n`));
		process.exit(1);
	}
	console.log(pass(`\n${email} can no longer reach the admin.\n`));
	process.exit(0);
}

const { error } = await db.from("admins").upsert({ user_id: user.id }, { onConflict: "user_id" });

if (error) {
	console.error(fail(`\nCould not grant access: ${error.message}\n`));
	process.exit(1);
}

console.log(pass(`\n${email} can now reach the admin.`));

if (!user.email_confirmed_at) {
	console.log(
		fail("\nThat account is not confirmed yet, so signing in will fail.") +
			dim("\nConfirm it under Authentication > Users, or recreate it with Auto Confirm ticked."),
	);
}

const { data: admins } = await db.from("admins").select("user_id");
if ((admins?.length ?? 0) > 1) {
	console.log(dim(`\n${admins.length} accounts can reach the admin.`));
}

console.log(dim("\nSign in at http://localhost:3000/admin\n"));
