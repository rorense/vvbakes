/**
 * Sends two real order emails to an address you name, so a new sending setup
 * can be proven before a customer is on the other end of it.
 *
 *   npm run emails:test -- you@example.com
 *
 * The two cover both reply directions, which is the part worth testing:
 *
 *   order-confirmed   goes to the customer, replies to the shop's contact email
 *   new-order-owner   goes to her, replies to the customer
 *
 * It calls Resend with the same arguments lib/email.ts does, against the same
 * templates, but does not go through sendOrderEmail: that records an
 * order_events row against a real order id, and this order does not exist.
 */
import { render } from "@react-email/render";
import { readFile } from "node:fs/promises";
import { Resend } from "resend";
import { SUBJECTS, TEMPLATES, type EmailContext, type TemplateName } from "../emails/templates";
import { order, privateSettings, settings } from "./example-order.mjs";

const to = process.argv[2];
if (!to || !to.includes("@")) {
	console.error("Usage: npm run emails:test -- you@example.com");
	process.exit(1);
}

// tsx does not read .env.local on its own.
for (const line of (await readFile(".env.local", "utf8")).split("\n")) {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
	const at = trimmed.indexOf("=");
	const key = trimmed.slice(0, at).trim();
	if (process.env[key]) continue;
	process.env[key] = trimmed
		.slice(at + 1)
		.trim()
		.replace(/^["']|["']$/g, "");
}

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM;
if (!apiKey || !from) {
	console.error("RESEND_API_KEY and EMAIL_FROM both have to be set in .env.local.");
	process.exit(1);
}

// The real origin, so the header badge loads rather than pointing at localhost.
const context: EmailContext = {
	order,
	settings,
	privateSettings,
	siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://vvbakes.co.nz",
};

const resend = new Resend(apiKey);

const cases: Array<{ template: TemplateName; replyTo: string; why: string }> = [
	{
		template: "order-confirmed",
		replyTo: settings.contactEmail ?? "",
		why: "customer mail, replies to the shop",
	},
	{
		template: "new-order-owner",
		replyTo: order.customerEmail,
		why: "her alert, replies to the customer",
	},
];

console.log(`\nFrom: ${from}`);
console.log(`To:   ${to}\n`);

let failed = 0;

for (const { template, replyTo, why } of cases) {
	const element = TEMPLATES[template](context);
	const subject = `[test] ${SUBJECTS[template](context)}`;

	const { data, error } = await resend.emails.send({
		from,
		to,
		subject,
		html: await render(element),
		text: await render(element, { plainText: true }),
		replyTo,
	});

	if (error) {
		failed += 1;
		console.log(`  FAILED  ${template}`);
		console.log(`          ${error.name}: ${error.message}`);
	} else {
		console.log(`  sent    ${template}  (${why})`);
		console.log(`          reply-to ${replyTo}`);
		console.log(`          id ${data?.id}`);
	}
}

console.log(
	failed === 0
		? "\nBoth accepted by Resend. Acceptance is not delivery: check the inbox, check spam,\nand hit Reply on each to confirm where it goes.\n"
		: `\n${failed} of ${cases.length} refused. Nothing was delivered for those.\n`,
);
process.exit(failed === 0 ? 0 : 1);
