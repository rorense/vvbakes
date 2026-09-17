import { NextResponse } from "next/server";
import { getOrderByToken } from "@/lib/orders";
import { recordOptOut } from "@/lib/unsubscribe";

/**
 * The address in the feedback request's `List-Unsubscribe` header.
 *
 * RFC 8058 one-click: when a mail client draws its own unsubscribe button and
 * the reader presses it, the provider posts here on their behalf. Nobody sees a
 * page of ours, so there is nothing to confirm and nothing to explain; the
 * answer is a 200 and the row is written.
 *
 * Why it is safe to act without asking, when the visible link in the same email
 * is not: this only ever acts on POST. Corporate mail scanners open every URL
 * in a message with GET, and a route that unsubscribed on GET would mute
 * customers who never touched it. So GET sends a person to the page with the
 * button on it instead, which is also what happens if somebody pastes this
 * address into a browser.
 *
 * No rate limiter, deliberately. The write is an idempotent upsert on a primary
 * key, and an unsubscribe is the one request a shop should never turn away.
 */
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ token: string }> }) {
	const { token } = await params;
	const order = await getOrderByToken(token);

	// Deliberately the same answer as a token that never existed: this endpoint
	// is reachable by anyone, and telling them whether a token is real would
	// make it an oracle for guessing order links.
	if (!order) {
		return NextResponse.json({ error: "unknown" }, { status: 404 });
	}

	const saved = await recordOptOut(order, "one-click");
	if (!saved) {
		// Providers retry a 5xx, which is what we want: the alternative is a
		// reader who pressed the button and goes on getting the email.
		return NextResponse.json({ error: "could not save" }, { status: 503 });
	}

	// Providers want a 200 and read nothing else. The body is for a human who
	// posted here by hand.
	return NextResponse.json({ ok: true, unsubscribed: true });
}

/**
 * Anything that is not the one-click button gets the page with the button on
 * it, which is the only place a person can read what they are agreeing to.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
	const { token } = await params;
	// Encoded rather than interpolated raw: a token holding "../" would
	// otherwise resolve to some other page of ours. The page itself refuses
	// anything that is not 32 hex characters, so this only has to stay inside
	// the route it was aimed at.
	const target = new URL(`/unsubscribe/${encodeURIComponent(token)}`, request.url);
	return NextResponse.redirect(target, 303);
}
