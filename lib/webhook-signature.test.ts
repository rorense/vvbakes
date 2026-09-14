/**
 * This check is the only thing standing between the webhook route and anyone
 * who knows the URL. Get it wrong and a stranger can write rows into a
 * customer's order history by posting JSON at it.
 *
 * So the assertions that matter are the refusals. The one positive case is the
 * vector published with the Standard Webhooks specification, which is worth
 * more than a signature this file generated for itself: it proves the
 * implementation agrees with the senders, rather than only with itself.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhook } from "./webhook-signature";

const VECTOR = {
	secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
	id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
	timestamp: "1614265330",
	// Written out byte for byte. JSON.stringify drops the space after the colon,
	// and the signature covers the bytes as they were sent.
	body: '{"test": 2432232314}',
	signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};

/** The moment the vector was signed, so the freshness window is satisfied. */
const SIGNED_AT = new Date(Number(VECTOR.timestamp) * 1000);

const headers = (
	overrides: Partial<Record<"id" | "timestamp" | "signature", string | null>> = {},
) => ({
	id: VECTOR.id,
	timestamp: VECTOR.timestamp,
	signature: VECTOR.signature,
	...overrides,
});

describe("a genuine call", () => {
	it("accepts the specification's own vector", () => {
		expect(verifyWebhook(VECTOR.body, headers(), VECTOR.secret, SIGNED_AT)).toEqual({ ok: true });
	});

	it("accepts when the header carries an older signature alongside the current one", () => {
		const signature = `v1,b0gus00000000000000000000000000000000000000= ${VECTOR.signature}`;
		expect(verifyWebhook(VECTOR.body, headers({ signature }), VECTOR.secret, SIGNED_AT)).toEqual({
			ok: true,
		});
	});

	it("accepts at the far edge of the freshness window", () => {
		const almostStale = new Date(SIGNED_AT.getTime() + 5 * 60 * 1000);
		expect(verifyWebhook(VECTOR.body, headers(), VECTOR.secret, almostStale)).toEqual({ ok: true });
	});
});

describe("a call that must be refused", () => {
	it("refuses a body edited after signing", () => {
		const result = verifyWebhook(`${VECTOR.body} `, headers(), VECTOR.secret, SIGNED_AT);
		expect(result).toEqual({ ok: false, reason: "no matching signature" });
	});

	it("refuses a signature made with a different secret", () => {
		const other = "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
		const result = verifyWebhook(VECTOR.body, headers(), other, SIGNED_AT);
		expect(result).toEqual({ ok: false, reason: "no matching signature" });
	});

	it("refuses a genuine call replayed once the window has passed", () => {
		const tooLate = new Date(SIGNED_AT.getTime() + 5 * 60 * 1000 + 1000);
		const result = verifyWebhook(VECTOR.body, headers(), VECTOR.secret, tooLate);
		expect(result).toEqual({ ok: false, reason: "timestamp outside tolerance" });
	});

	it("refuses a timestamp from the future by the same margin", () => {
		const tooEarly = new Date(SIGNED_AT.getTime() - 5 * 60 * 1000 - 1000);
		const result = verifyWebhook(VECTOR.body, headers(), VECTOR.secret, tooEarly);
		expect(result).toEqual({ ok: false, reason: "timestamp outside tolerance" });
	});

	it.each(["id", "timestamp", "signature"] as const)("refuses with no %s header", (missing) => {
		const result = verifyWebhook(
			VECTOR.body,
			headers({ [missing]: null }),
			VECTOR.secret,
			SIGNED_AT,
		);
		expect(result).toEqual({ ok: false, reason: "missing signature headers" });
	});

	it("refuses a timestamp that is not a number", () => {
		const result = verifyWebhook(VECTOR.body, headers({ timestamp: "lunchtime" }), VECTOR.secret);
		expect(result).toEqual({ ok: false, reason: "malformed timestamp" });
	});

	it("refuses a signature under a scheme version it does not know", () => {
		const signature = VECTOR.signature.replace("v1,", "v2,");
		const result = verifyWebhook(VECTOR.body, headers({ signature }), VECTOR.secret, SIGNED_AT);
		expect(result).toEqual({ ok: false, reason: "no matching signature" });
	});

	it("refuses a signature of the right shape but the wrong length", () => {
		const result = verifyWebhook(
			VECTOR.body,
			headers({ signature: "v1,AAAA" }),
			VECTOR.secret,
			SIGNED_AT,
		);
		expect(result).toEqual({ ok: false, reason: "no matching signature" });
	});

	it("refuses a body signed for a different message id", () => {
		// Everything genuine except the id, which is what stops one accepted
		// message being replayed under another's identity.
		const key = Buffer.from(VECTOR.secret.replace(/^whsec_/, ""), "base64");
		const forOtherId = createHmac("sha256", key)
			.update(`msg_somethingelse.${VECTOR.timestamp}.${VECTOR.body}`)
			.digest("base64");

		const result = verifyWebhook(
			VECTOR.body,
			headers({ signature: `v1,${forOtherId}` }),
			VECTOR.secret,
			SIGNED_AT,
		);
		expect(result).toEqual({ ok: false, reason: "no matching signature" });
	});
});
