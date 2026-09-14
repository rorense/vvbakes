/**
 * Resend signs its webhooks to the Standard Webhooks specification, which is
 * the scheme Svix implements: an HMAC over the message id, the timestamp and
 * the exact bytes of the body. The id and timestamp are in there so that a
 * genuine call cannot be captured and replayed later, and the body is covered
 * so its contents cannot be edited on the way.
 *
 * Verified here rather than with the provider's SDK. It is a dozen lines of
 * node:crypto, it can be tested against the specification's own vector, and a
 * route that writes to the database on the strength of this check is the last
 * place to take an opaque dependency on trust.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * How stale a signed timestamp may be before the call is refused.
 *
 * Five minutes is the figure the specification suggests. It has to be long
 * enough to survive a retry and a slow cold start, and short enough that a
 * captured request is worthless by the time anyone could reuse it.
 */
const TOLERANCE_SECONDS = 5 * 60;

export interface SignatureHeaders {
	id: string | null;
	timestamp: string | null;
	signature: string | null;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/**
 * True only for a body that was signed with this secret, recently.
 *
 * `now` is injectable so the timestamp window can be tested without waiting
 * five minutes for one.
 */
export function verifyWebhook(
	body: string,
	headers: SignatureHeaders,
	secret: string,
	now: Date = new Date(),
): VerifyResult {
	const { id, timestamp, signature } = headers;
	if (!id || !timestamp || !signature) return { ok: false, reason: "missing signature headers" };

	const signedAt = Number(timestamp);
	if (!Number.isFinite(signedAt)) return { ok: false, reason: "malformed timestamp" };

	const drift = Math.abs(Math.floor(now.getTime() / 1000) - signedAt);
	if (drift > TOLERANCE_SECONDS) return { ok: false, reason: "timestamp outside tolerance" };

	// The whsec_ prefix is a label on the secret, not part of it.
	const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
	const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();

	// The header carries every signature currently considered valid, space
	// separated and each tagged with its scheme version. One match is enough,
	// which is what lets a secret be rotated without dropping the calls still
	// being signed with the old one.
	for (const entry of signature.split(" ")) {
		const [version, value] = entry.split(",");
		if (version !== "v1" || !value) continue;

		const candidate = Buffer.from(value, "base64");
		// timingSafeEqual throws on a length mismatch rather than returning false,
		// and a length is not a secret, so it is checked first.
		if (candidate.length !== expected.length) continue;
		if (timingSafeEqual(candidate, expected)) return { ok: true };
	}

	return { ok: false, reason: "no matching signature" };
}
