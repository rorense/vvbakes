import "server-only";

import { render } from "@react-email/render";
import { Resend } from "resend";
import { SUBJECTS, TEMPLATES, type EmailContext, type TemplateName } from "@/emails/templates";
import { siteUrl } from "./constants";
import { createAdminClient } from "./supabase/admin";
import { hasOptedOut } from "./optouts";
import { OPTED_OUT, unsubscribeHeaders } from "./unsubscribe";
import type { Order, PrivateSettings, SiteSettings } from "./types";

/**
 * Transactional email.
 *
 * Sent through Resend's HTTP API, from the shop's own verified domain.
 *
 * This went over SMTP from an ordinary mailbox for as long as there was no
 * domain to send from. An API suits where this actually runs: one HTTPS
 * request rather than a TCP and TLS handshake to port 465 inside a function
 * that may only live a second, and a refusal that arrives as a structured
 * error rather than an SMTP string to read by eye.
 *
 * Sending is best-effort by design. A confirmed order whose email bounced is
 * still a confirmed order; the failure is recorded against the order so the
 * owner can see it in the admin and follow up by hand.
 */

export interface SendResult {
	sent: boolean;
	skipped?: string;
	error?: string;
	/**
	 * Resend's id for the accepted message. Recorded against the order so that a
	 * bounce arriving by webhook minutes later can be matched back to it; that
	 * id is the only thing the two have in common.
	 */
	id?: string;
}

function mailConfig() {
	const apiKey = process.env.RESEND_API_KEY;
	const from = process.env.EMAIL_FROM;

	if (!apiKey || !from) return null;
	return { apiKey, from };
}

async function deliver(options: {
	to: string;
	subject: string;
	html: string;
	text: string;
	replyTo?: string | null;
	/** Extra headers. Only the feedback request sets any; see lib/unsubscribe.ts. */
	headers?: Record<string, string>;
}): Promise<SendResult> {
	const config = mailConfig();
	if (!config) {
		return { sent: false, skipped: "Resend is not configured" };
	}

	try {
		const { data, error } = await new Resend(config.apiKey).emails.send({
			from: config.from,
			to: options.to,
			subject: options.subject,
			html: options.html,
			text: options.text,
			// Anyone may be replied to now. Yahoo's SMTP refused a Reply-To on any
			// domain but the sending account's, which cost the owner every
			// new-order alert until the header was dropped for mismatches. Only
			// the From domain is signed here, so her own mailbox can take the
			// replies without the shop having to send from it.
			replyTo: options.replyTo ?? undefined,
			headers: options.headers,
		});

		if (error) {
			return { sent: false, error: `${error.name}: ${error.message}` };
		}
		return { sent: true, id: data?.id };
	} catch (error) {
		return { sent: false, error: error instanceof Error ? error.message : String(error) };
	}
}

/** Records what happened against the order, so failures are visible in the admin. */
async function logEmail(
	orderId: string,
	template: TemplateName,
	to: string,
	result: SendResult,
): Promise<void> {
	try {
		const supabase = createAdminClient();
		await supabase.from("order_events").insert({
			order_id: orderId,
			type: result.sent ? "email_sent" : "email_failed",
			data: {
				template,
				to,
				// What the bounce webhook joins on.
				...(result.id ? { emailId: result.id } : {}),
				...(result.error ? { error: result.error } : {}),
				...(result.skipped ? { skipped: result.skipped } : {}),
			},
		});
	} catch (error) {
		// Logging must never be the thing that breaks an order.
		console.error("[vvbakes] could not record email event", error);
	}
}

/**
 * Something worth seeing on the order that is not a delivery outcome.
 *
 * Kept apart from `logEmail` because the two are read differently: the admin
 * treats `email_failed` as something needing her attention, and an email the
 * shop chose not to send is the opposite of that.
 */
async function logNote(
	orderId: string,
	data: Record<string, string | number | boolean>,
): Promise<void> {
	try {
		await createAdminClient().from("order_events").insert({
			order_id: orderId,
			type: "note",
			data,
		});
	} catch (error) {
		console.error("[vvbakes] could not record an email note", error);
	}
}

export interface SendOrderEmailOptions {
	template: TemplateName;
	order: Order;
	settings: SiteSettings;
	privateSettings: PrivateSettings;
	/** Defaults to the customer; the owner template overrides it. */
	to?: string | null;
}

/**
 * Renders and sends one order email. Never throws, the caller has already done
 * the thing the email is about.
 */
export async function sendOrderEmail(options: SendOrderEmailOptions): Promise<SendResult> {
	const { template, order, settings, privateSettings } = options;

	const to =
		options.to ??
		(template === "new-order-owner" ? privateSettings.notificationEmail : order.customerEmail);

	if (!to) {
		const result: SendResult = { sent: false, skipped: "no recipient address" };
		await logEmail(order.id, template, "", result);
		return result;
	}

	// The one email anybody may refuse, and the check that makes the refusal
	// mean something. It lives here rather than in the job that sends it so that
	// no future caller can reach the template without passing it.
	//
	// Recorded as a `note`, not an `email_failed`: nothing went wrong, and the
	// admin's "an email to this customer didn't send" banner keys on the failure
	// events. See lib/unsubscribe.ts.
	if (template === "feedback-request" && (await hasOptedOut(to))) {
		await logNote(order.id, { skipped: template, reason: OPTED_OUT, to });
		return { sent: false, skipped: OPTED_OUT };
	}

	const origin = siteUrl();
	const context: EmailContext = { order, settings, privateSettings, siteUrl: origin };

	try {
		const element = TEMPLATES[template](context);
		const html = await render(element);
		const text = await render(element, { plainText: true });
		const subject = SUBJECTS[template](context);

		const result = await deliver({
			to,
			subject,
			html,
			text,
			// Only on the one that can be unsubscribed from. An order
			// confirmation carrying this would offer to stop an email the shop
			// would go on sending regardless.
			headers:
				template === "feedback-request"
					? unsubscribeHeaders({
							siteUrl: origin,
							token: order.token,
							contactEmail: settings.contactEmail,
						})
					: undefined,
			// Owner notifications should reply to the customer; customer mail
			// should reply to the bakery.
			replyTo:
				template === "new-order-owner" ? order.customerEmail : (settings.contactEmail ?? null),
		});

		await logEmail(order.id, template, to, result);
		return result;
	} catch (error) {
		const result: SendResult = {
			sent: false,
			error: error instanceof Error ? error.message : String(error),
		};
		await logEmail(order.id, template, to, result);
		console.error(`[vvbakes] ${template} email failed`, error);
		return result;
	}
}

/** True when email is configured at all. The admin surfaces this. */
export function isEmailConfigured(): boolean {
	return mailConfig() !== null;
}
