import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { verifyWebhook } from "@/lib/webhook-signature";

/**
 * What Resend has to say about a message after it accepted it.
 *
 * `deliver` can only report that the API took the message. A refusal by the
 * receiving server lands minutes later, long after the response has gone, and
 * without this route it lands nowhere: the admin would still read "Sent the
 * order-confirmed email" for an address that never received one.
 *
 * Only two events are acted on. A bounce is the address refusing to take it,
 * which the owner needs to see against the order. A complaint is the customer
 * marking it as spam, which is worth recording even though nothing can be done
 * for that order, because enough of them and the domain stops being delivered
 * for everybody.
 *
 * Anything else Resend sends is answered 200 and dropped. A non-2xx here means
 * "try again", so it is reserved for the cases where a retry might actually
 * work; a delivered notification we have no use for is not one of them.
 */
export const dynamic = "force-dynamic";

/** Resend's event names, and the kind of trail entry each becomes. */
const HANDLED = {
	"email.bounced": "email_bounced",
	"email.complained": "email_complained",
} as const;

type HandledEvent = keyof typeof HANDLED;

interface ResendWebhookBody {
	type?: string;
	data?: {
		email_id?: string;
		to?: string | string[];
		subject?: string;
		bounce?: { type?: string; subType?: string; message?: string };
	};
}

/** The plainest sentence the payload supports about why this arrived. */
function describeReason(type: HandledEvent, data: ResendWebhookBody["data"]): string {
	if (type === "email.complained") return "marked as spam by the recipient";
	const bounce = data?.bounce;
	// `||`, not `??`: join() returns "" for an empty list rather than nullish, so
	// `??` would hand the admin a bounce with no reason on it at all.
	const classified = [bounce?.type, bounce?.subType].filter(Boolean).join(" / ");
	return bounce?.message || classified || "bounced";
}

export async function POST(request: Request) {
	const secret = process.env.RESEND_WEBHOOK_SECRET;
	if (!secret) {
		return NextResponse.json({ error: "RESEND_WEBHOOK_SECRET is not configured" }, { status: 500 });
	}

	// The bytes exactly as sent. The signature covers those, and re-serialising
	// a parsed object would not reproduce them.
	const body = await request.text();

	const verified = verifyWebhook(
		body,
		{
			id: request.headers.get("svix-id"),
			timestamp: request.headers.get("svix-timestamp"),
			signature: request.headers.get("svix-signature"),
		},
		secret,
	);

	if (!verified.ok) {
		// Deliberately terse. An attacker probing this should learn nothing about
		// which part of their forgery was wrong.
		console.warn(`[vvbakes] rejected a webhook call: ${verified.reason}`);
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}

	let payload: ResendWebhookBody;
	try {
		payload = JSON.parse(body) as ResendWebhookBody;
	} catch {
		return NextResponse.json({ error: "body is not JSON" }, { status: 400 });
	}

	const eventType = payload.type;
	if (!eventType || !(eventType in HANDLED)) {
		return NextResponse.json({ ok: true, ignored: eventType ?? null });
	}

	const emailId = payload.data?.email_id;
	if (!emailId) {
		return NextResponse.json({ ok: true, skipped: "no email id in payload" });
	}

	if (!hasSupabaseConfig()) {
		return NextResponse.json({ ok: true, skipped: "supabase not configured" });
	}

	const supabase = createAdminClient();
	const type = HANDLED[eventType as HandledEvent];

	// Everything this route needs to know about the message, in one read.
	//
	// Two things are being asked, and they are the same question of the same
	// index: which send does this belong to, and have we already recorded this
	// outcome against it. Asking them separately was two round trips for one
	// lookup, and only the first had its error checked — a failed dedupe read
	// used to fall through and write the duplicate it was there to prevent.
	const { data: events, error } = await supabase
		.from("order_events")
		.select("type, order_id, data")
		.eq("data->>emailId", emailId)
		.in("type", ["email_sent", type]);

	if (error) {
		return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
	}

	// Mail sent outside an order, the test script's for one, has no send row and
	// is not an error.
	const sent = (events ?? []).find((event) => event.type === "email_sent");
	if (!sent) {
		return NextResponse.json({ ok: true, skipped: "no order for this message" });
	}

	// Webhooks are delivered at least once, so the same bounce can arrive twice.
	if ((events ?? []).some((event) => event.type === type)) {
		return NextResponse.json({ ok: true, skipped: "already recorded" });
	}

	// Carried across from the send so the trail reads the same either way. It is
	// a jsonb column, so nothing guarantees the shape; anything but a string is
	// treated as absent rather than written back out.
	const sentData = sent.data as Record<string, unknown> | null;
	const template = typeof sentData?.template === "string" ? sentData.template : null;
	const to = Array.isArray(payload.data?.to) ? payload.data.to[0] : payload.data?.to;

	const { error: insertError } = await supabase.from("order_events").insert({
		order_id: sent.order_id,
		type,
		data: {
			template,
			to: to ?? null,
			emailId,
			reason: describeReason(eventType as HandledEvent, payload.data),
		},
	});

	if (insertError) {
		// Worth a retry: the row is what the owner will actually see.
		return NextResponse.json({ ok: false, error: insertError.message }, { status: 502 });
	}

	return NextResponse.json({ ok: true, recorded: type });
}
