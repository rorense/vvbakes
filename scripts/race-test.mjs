/**
 * Checks that two customers cannot both take the last slot on a day.
 *
 *   node scripts/race-test.mjs 2026-09-19 [rounds]
 *
 * Reads .env.local for the service role key. Development only, it writes real
 * orders, so point it at a development Supabase project, and expect to delete
 * the rows it leaves behind.
 *
 * `place_order` takes an advisory lock on the pickup date before it counts
 * existing orders. Without that lock, two requests arriving together both read
 * "one space free" and both get written; with it, the second waits, re-reads,
 * and is refused. This fires both at the same instant and asserts exactly one
 * succeeds.
 */
import { createClient } from "@supabase/supabase-js";

// Node's own .env parser. Like the one it replaced, it leaves a variable
// that is already set alone.
function loadEnv() {
	try {
		process.loadEnvFile(".env.local");
	} catch {
		// Fall back to whatever is already in the environment.
	}
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
	console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or fill .env.local).");
	process.exit(1);
}

const pickupDate = process.argv[2];
const rounds = Number(process.argv[3] ?? 5);

if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate ?? "")) {
	console.error("Usage: node scripts/race-test.mjs YYYY-MM-DD [rounds]");
	process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data: products, error: productError } = await supabase
	.from("products")
	.select("id, name, qty_step")
	.eq("is_available", true)
	.limit(1);

if (productError || !products?.length) {
	console.error("Could not find an available product:", productError?.message ?? "none found");
	process.exit(1);
}

const product = products[0];

console.log(`Racing pairs of orders for ${pickupDate} using "${product.name}".`);
console.log("Set that date's capacity to 1 in the admin before each round.\n");

let failures = 0;

for (let round = 1; round <= rounds; round += 1) {
	// Clear the day so each round starts from an empty slot.
	await supabase.from("orders").delete().eq("pickup_date", pickupDate).like("ip_hash", "racetest%");

	const attempt = (n) =>
		supabase.rpc("place_order", {
			p_items: [{ product_id: product.id, qty: product.qty_step }],
			p_pickup_date: pickupDate,
			p_fulfilment: "pickup",
			p_customer_name: `Race Test ${n}`,
			p_customer_email: `race${n}@example.com`,
			p_customer_phone: "021 555 0000",
			p_delivery_address: null,
			p_notes: "Automated race test, safe to delete.",
			p_custom_request: null,
			// Distinct hashes so the rate limiter does not mask the result.
			p_ip_hash: `racetest-${round}-${n}`,
		});

	const [first, second] = await Promise.all([attempt("A"), attempt("B")]);

	const succeeded = [first, second].filter((result) => !result.error);
	const refusedForFullness = [first, second].filter((result) =>
		result.error?.message?.includes("DATE_FULL"),
	);

	const passed = succeeded.length === 1 && refusedForFullness.length === 1;
	if (!passed) failures += 1;

	console.log(
		`Round ${round}: ${passed ? "pass" : "FAIL"}: ${succeeded.length} accepted, ` +
			`${refusedForFullness.length} refused as full` +
			(passed
				? ""
				: `\n  A: ${first.error?.message ?? "accepted"}\n  B: ${second.error?.message ?? "accepted"}`),
	);
}

// Leave the database as we found it.
await supabase.from("orders").delete().eq("pickup_date", pickupDate).like("ip_hash", "racetest%");

console.log(
	failures === 0
		? `\nAll ${rounds} rounds behaved correctly. Test orders removed.`
		: `\n${failures} of ${rounds} rounds were wrong, capacity is not being enforced.`,
);

process.exit(failures === 0 ? 0 : 1);
