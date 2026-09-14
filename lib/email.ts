import "server-only";

import { render } from "@react-email/render";
import { Resend } from "resend";
import { SUBJECTS, TEMPLATES, type EmailContext, type TemplateName } from "@/emails/templates";
import { siteUrl } from "./constants";
import { createAdminClient } from "./supabase/admin";
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
}): Promise<SendResult> {
	const config = mailConfig();
	if (!config) {
		return { sent: false, skipped: "Resend is not configured" };
	}

	try {
		const { error } = await new Resend(config.apiKey).emails.send({
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
		});

		if (error) {
			return { sent: false, error: `${error.name}: ${error.message}` };
		}
		return { sent: true };
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
				...(result.error ? { error: result.error } : {}),
				...(result.skipped ? { skipped: result.skipped } : {}),
			},
		});
	} catch (error) {
		// Logging must never be the thing that breaks an order.
		console.error("[vvbakes] could not record email event", error);
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

	const context: EmailContext = { order, settings, privateSettings, siteUrl: siteUrl() };

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
