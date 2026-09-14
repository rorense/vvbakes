import "server-only";

import { render } from "@react-email/render";
import nodemailer from "nodemailer";
import { SUBJECTS, TEMPLATES, type EmailContext, type TemplateName } from "@/emails/templates";
import { siteUrl } from "./constants";
import { createAdminClient } from "./supabase/admin";
import type { Order, PrivateSettings, SiteSettings } from "./types";

/**
 * Transactional email.
 *
 * Sent over SMTP with nodemailer rather than through an email API, because the
 * shop has no domain of its own yet and every API provider's sandbox sender can
 * only deliver back to the account owner, customer mail would silently vanish.
 * An app password on an ordinary mailbox works today and needs no DNS.
 *
 * Swapping to a provider later means changing `deliver` and nothing else.
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

function smtpConfig() {
	const host = process.env.SMTP_HOST;
	const user = process.env.SMTP_USER;
	const pass = process.env.SMTP_PASS;
	const from = process.env.EMAIL_FROM ?? user;

	if (!host || !user || !pass || !from) return null;

	const port = Number(process.env.SMTP_PORT ?? 465);
	return {
		host,
		port,
		// 465 is implicit TLS; 587 upgrades with STARTTLS.
		secure: port === 465,
		auth: { user, pass },
		from,
	};
}

/** The domain of an address, given either bare or as `Name <addr>`. */
function domainOf(address: string): string | null {
	const angled = address.match(/<([^>]+)>/);
	const bare = (angled?.[1] ?? address).trim();
	const at = bare.lastIndexOf("@");
	return at === -1 ? null : bare.slice(at + 1).toLowerCase();
}

/**
 * Yahoo's SMTP rejects, with `550 Request failed; Mailbox unavailable`, any
 * message carrying a Reply-To on a domain other than the account sending it.
 * The owner's new-order alert replies to the customer, so under Yahoo it was
 * every single one of them, and she heard about no orders at all.
 *
 * Dropping the header rather than the message is the right trade: the alert is
 * the thing she needs, and the customer's address is printed in its body
 * anyway. Same-domain addresses still get a Reply-To, so once the shop sends
 * from its own domain the customer emails keep theirs.
 */
function allowedReplyTo(from: string, replyTo: string | null | undefined): string | undefined {
	if (!replyTo) return undefined;
	const sender = domainOf(from);
	return sender && domainOf(replyTo) === sender ? replyTo : undefined;
}

async function deliver(options: {
	to: string;
	subject: string;
	html: string;
	text: string;
	replyTo?: string | null;
}): Promise<SendResult> {
	const config = smtpConfig();
	if (!config) {
		return { sent: false, skipped: "SMTP is not configured" };
	}

	try {
		const transport = nodemailer.createTransport({
			host: config.host,
			port: config.port,
			secure: config.secure,
			auth: config.auth,
		});

		await transport.sendMail({
			from: config.from,
			to: options.to,
			subject: options.subject,
			html: options.html,
			text: options.text,
			replyTo: allowedReplyTo(config.from, options.replyTo),
		});

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
	return smtpConfig() !== null;
}
