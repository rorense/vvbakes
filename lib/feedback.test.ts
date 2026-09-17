/**
 * The nightly job that asks how it went.
 *
 * Worth testing at this level rather than only in SQL, because the thing that
 * can go wrong here is not a wrong row, it is a right row arriving in the
 * inbox of somebody who ordered a cake in March. The window, the cap and the
 * stamp are the three things standing between one polite email and a mailshot,
 * so each of them is asserted directly.
 *
 * Supabase is a recording fake: every chained call is kept, so the query the
 * job actually builds can be read back and checked, which a stub returning rows
 * could not show.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws on import outside a React Server Component, and the
// module under test imports it. Same shim as lib/instagram.test.ts.
vi.mock("server-only", () => ({}));

const sendOrderEmail = vi.fn();
const isEmailConfigured = vi.fn(() => true);

vi.mock("./email", () => ({
	sendOrderEmail: (...args: unknown[]) => sendOrderEmail(...args),
	isEmailConfigured: () => isEmailConfigured(),
}));

vi.mock("./queries", () => ({
	getSettings: async () => ({ timezone: "Pacific/Auckland", businessName: "vvbakes" }),
}));

vi.mock("./orders", () => ({
	getPrivateSettings: async () => ({ notificationEmail: "her@example.com" }),
}));

vi.mock("./supabase/env", () => ({ hasSupabaseConfig: () => true }));

/** One recorded link in a chain: the method that was called and what with. */
interface Call {
	method: string;
	args: unknown[];
}

interface Chain {
	table: string;
	calls: Call[];
}

let chains: Chain[] = [];
let dueRows: unknown[] = [];
let selectError: { message: string } | null = null;
let updateError: { message: string } | null = null;

/**
 * A Supabase client that records rather than talks.
 *
 * Every builder method returns the same thenable, so a chain of any length
 * works and awaiting it at the end resolves to whatever the test set up. Reads
 * hand back `dueRows`; writes hand back `updateError`.
 */
function fakeClient() {
	return {
		from(table: string) {
			const chain: Chain = { table, calls: [] };
			chains.push(chain);

			const isWrite = { value: false };

			const builder: Record<string, unknown> = {
				then(resolve: (value: unknown) => unknown) {
					return Promise.resolve(
						isWrite.value
							? { error: updateError }
							: { data: selectError ? null : dueRows, error: selectError },
					).then(resolve);
				},
			};

			for (const method of ["select", "is", "in", "gte", "lte", "lt", "order", "limit", "eq"]) {
				builder[method] = (...args: unknown[]) => {
					chain.calls.push({ method, args });
					return builder;
				};
			}

			builder.update = (...args: unknown[]) => {
				isWrite.value = true;
				chain.calls.push({ method: "update", args });
				return builder;
			};

			return builder;
		},
	};
}

vi.mock("./supabase/admin", () => ({ createAdminClient: () => fakeClient() }));

const { askWindow, sendFeedbackRequests } = await import("./feedback");

/** Just enough of an order row for `toOrder` to make an Order out of it. */
function orderRow(reference: string, pickupDate: string, collectedAt = "2026-09-16T04:00:00Z") {
	return {
		id: `id-${reference}`,
		order_number: 1,
		reference,
		token: "0123456789abcdef0123456789abcdef",
		status: "collected",
		fulfilment: "pickup",
		pickup_date: pickupDate,
		pickup_time: null,
		customer_name: "Alex Whitiora",
		customer_email: "alex@example.com",
		customer_phone: "021 555 0100",
		delivery_address: null,
		notes: null,
		custom_request: null,
		inspiration_image_paths: [],
		inspiration_url: null,
		subtotal_cents: 0,
		delivery_fee_cents: 0,
		quote_cents: 0,
		total_cents: 0,
		internal_notes: null,
		cancellation_reason: null,
		confirmed_at: null,
		ready_at: null,
		collected_at: collectedAt,
		cancelled_at: null,
		feedback_requested_at: null,
		created_at: "2026-09-01T00:00:00Z",
		updated_at: "2026-09-01T00:00:00Z",
		order_items: [],
	};
}

/** The one read the job makes, as it was built. */
function readChain(): Chain {
	return chains.find((chain) => chain.calls.some((call) => call.method === "select"))!;
}

function argsOf(chain: Chain, method: string): unknown[][] {
	return chain.calls.filter((call) => call.method === method).map((call) => call.args);
}

beforeEach(() => {
	vi.useFakeTimers();
	// Mid-morning in Auckland on 18 September 2026, so "today" is unambiguous
	// whichever side of UTC midnight the clock is read on.
	vi.setSystemTime(new Date("2026-09-17T22:00:00.000Z"));

	chains = [];
	dueRows = [];
	selectError = null;
	updateError = null;
	sendOrderEmail.mockReset();
	sendOrderEmail.mockResolvedValue({ sent: true, id: "resend-1" });
	isEmailConfigured.mockReturnValue(true);
	process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
});

afterEach(() => {
	vi.useRealTimers();
});

describe("askWindow", () => {
	// Half open, and both ends are midnight in Auckland rather than in UTC. The
	// twelve hours between the two are the difference between an order collected
	// on Tuesday evening being asked about on Wednesday and on Thursday.
	it("closes at the moment today began where the bakery is", () => {
		expect(askWindow("2026-09-18", "Pacific/Auckland")).toEqual({
			from: "2026-09-03T12:00:00.000Z",
			until: "2026-09-17T12:00:00.000Z",
		});
	});

	// Summer time moves the boundary by an hour. Nothing in the job knows that;
	// the helper does.
	it("follows the zone through daylight saving", () => {
		expect(askWindow("2026-12-18", "Pacific/Auckland").until).toBe("2026-12-17T11:00:00.000Z");
	});

	// The guard that matters. Anything collected longer ago than the window is
	// never asked about, so shipping this cannot email years of past customers
	// at once, and neither can a cron that was broken for a month.
	it("never reaches back further than a fortnight", () => {
		const { from, until } = askWindow("2026-09-18", "Pacific/Auckland");
		const days = (Date.parse(until) - Date.parse(from)) / 86_400_000;
		expect(days).toBe(14);
	});
});

describe("sendFeedbackRequests", () => {
	it("sends nothing at all when email is not configured", async () => {
		isEmailConfigured.mockReturnValue(false);

		const result = await sendFeedbackRequests();

		expect(result).toEqual({ ok: true, skipped: "email is not configured" });
		expect(sendOrderEmail).not.toHaveBeenCalled();
		// Nothing was read either, so nothing could have been stamped: an order
		// stamped without a send would never be asked again.
		expect(chains).toHaveLength(0);
	});

	// The whole rule, in one assertion: collected and nothing else, never asked
	// before, and collected on an earlier day than today but inside a fortnight.
	it("asks only about unstamped orders collected inside the window", async () => {
		await sendFeedbackRequests();

		const chain = readChain();
		expect(chain.table).toBe("orders");
		expect(argsOf(chain, "is")).toEqual([["feedback_requested_at", null]]);
		// Not `in` with a list any more. A `ready` order has no moment to count
		// from except the pickup date, which is the guess this stopped trusting.
		expect(argsOf(chain, "eq")).toEqual([["status", "collected"]]);
		expect(argsOf(chain, "in")).toEqual([]);
		expect(argsOf(chain, "gte")).toEqual([["collected_at", "2026-09-03T12:00:00.000Z"]]);
		// Exclusive, so something collected earlier today is not asked about
		// tonight.
		expect(argsOf(chain, "lt")).toEqual([["collected_at", "2026-09-17T12:00:00.000Z"]]);
		expect(argsOf(chain, "lte")).toEqual([]);
		expect(argsOf(chain, "limit")).toEqual([[25]]);
	});

	it("emails each due order once and stamps it", async () => {
		dueRows = [orderRow("VV1042", "2026-09-16"), orderRow("VV1043", "2026-09-17")];

		const result = await sendFeedbackRequests();

		expect(result).toMatchObject({ ok: true, due: 2, sent: 2, failed: 0 });
		expect(sendOrderEmail).toHaveBeenCalledTimes(2);
		expect(sendOrderEmail.mock.calls[0]![0]).toMatchObject({
			template: "feedback-request",
			order: { reference: "VV1042" },
		});

		const stamps = chains.filter((chain) => chain.calls.some((call) => call.method === "update"));
		expect(stamps).toHaveLength(2);
		expect(argsOf(stamps[0]!, "eq")).toEqual([["id", "id-VV1042"]]);
		expect(Object.keys(argsOf(stamps[0]!, "update")[0]![0] as object)).toEqual([
			"feedback_requested_at",
		]);
	});

	// A bounced feedback request is not worth chasing, and an unstamped order
	// would be retried every night until it aged out of the window.
	it("stamps an order whose email failed, and says which one", async () => {
		dueRows = [orderRow("VV1042", "2026-09-16")];
		sendOrderEmail.mockResolvedValue({ sent: false, error: "mailbox full" });

		const result = await sendFeedbackRequests();

		expect(result).toMatchObject({ ok: false, sent: 0, failed: 1 });
		expect(result.problems).toEqual(["VV1042: mailbox full"]);
		expect(chains.some((chain) => chain.calls.some((call) => call.method === "update"))).toBe(true);
	});

	// The one failure that can repeat an email, so it has to be loud.
	it("says so when a send succeeded but the stamp did not", async () => {
		dueRows = [orderRow("VV1042", "2026-09-16")];
		updateError = { message: "connection lost" };

		const result = await sendFeedbackRequests();

		expect(result.ok).toBe(false);
		expect(result.sent).toBe(1);
		expect(result.problems?.[0]).toContain("could not be stamped");
	});

	// An opt-out and a bounce both mean "no email arrived", and they must not be
	// counted together: one is the system obeying somebody, the other is an
	// address that needs looking at.
	it("counts an unsubscribed customer apart from a failure, and still stamps", async () => {
		dueRows = [orderRow("VV1042", "2026-09-16"), orderRow("VV1043", "2026-09-17")];
		sendOrderEmail
			.mockResolvedValueOnce({ sent: false, skipped: "unsubscribed" })
			.mockResolvedValueOnce({ sent: true, id: "resend-2" });

		const result = await sendFeedbackRequests();

		expect(result).toMatchObject({ ok: true, due: 2, sent: 1, optedOut: 1, failed: 0 });
		expect(result.problems).toEqual([]);

		// Stamped like any other, so tonight's refusal is not repeated tomorrow.
		const stamps = chains.filter((chain) => chain.calls.some((call) => call.method === "update"));
		expect(stamps).toHaveLength(2);
		expect(argsOf(stamps[0]!, "eq")).toEqual([["id", "id-VV1042"]]);
	});

	it("does nothing on a night when nobody is due", async () => {
		const result = await sendFeedbackRequests();

		expect(result).toEqual({ ok: true, due: 0, sent: 0, optedOut: 0, failed: 0 });
		expect(sendOrderEmail).not.toHaveBeenCalled();
	});

	it("reports a read that failed rather than pretending nobody was due", async () => {
		selectError = { message: "relation does not exist" };

		const result = await sendFeedbackRequests();

		expect(result.ok).toBe(false);
		expect(result.problems?.[0]).toContain("could not read orders");
		expect(sendOrderEmail).not.toHaveBeenCalled();
	});
});
