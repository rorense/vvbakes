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
import type { Order, PrivateSettings, SiteSettings } from "../lib/types";

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

const order: Order = {
	id: "11111111-1111-1111-1111-111111111111",
	orderNumber: 1042,
	reference: "VV1042",
	token: "0123456789abcdef0123456789abcdef",
	status: "confirmed",
	fulfilment: "pickup",
	pickupDate: "2026-09-19",
	customerName: "Alex Whitiora",
	customerEmail: "alex@example.com",
	customerPhone: "021 555 0100",
	deliveryAddress: null,
	notes: "One of the cupcakes needs to be nut free please, my niece is allergic.",
	customRequest: "Could you write 'Happy 30th Sam' on one of them?",
	inspirationImagePaths: [],
	inspirationUrl: null,
	subtotalCents: 2000,
	deliveryFeeCents: 0,
	quoteCents: 0,
	totalCents: 2000,
	internalNotes: null,
	cancellationReason: null,
	createdAt: "2026-09-11T02:00:00Z",
	confirmedAt: "2026-09-11T03:00:00Z",
	readyAt: null,
	collectedAt: null,
	cancelledAt: null,
	items: [
		{
			id: "item-1",
			productId: "p1",
			productName: "Cupcakes",
			unitLabel: "each",
			qty: 5,
			lineTotalCents: 1500,
			pricingNote: "1 x 4 for $12.00 + 1 x $3.00 each",
		},
		{
			id: "item-2",
			productId: "p2",
			productName: "Cookies",
			unitLabel: "each",
			qty: 2,
			lineTotalCents: 500,
			pricingNote: "2 x $2.50 each",
		},
	],
};

const settings: SiteSettings = {
	businessName: "vvbakes",
	tagline: "inspired desserts",
	aboutText: null,
	pickupSuburb: "Mt Roskill, Auckland",
	pickupInstructions: "Park on the street and come to the side door.",
	pickupWindowText: "Pickups 4-7pm",
	leadTimeDays: 2,
	cutoffTime: "20:00:00",
	bookingWindowDays: 28,
	timezone: "Pacific/Auckland",
	ordersOpen: true,
	ordersClosedMessage: null,
	deliveryEnabled: false,
	deliveryFeeCents: 0,
	deliveryAreaText: null,
	contactEmail: "hello@example.com",
	contactPhone: "021 555 0199",
	instagramHandle: "vv.bakes",
};

const privateSettings: PrivateSettings = {
	bankAccountName: "V Example",
	bankAccountNumber: "12-3456-7890123-00",
	pickupAddress: "12 Example Road, Mt Roskill, Auckland 1041",
	notificationEmail: "orders@example.com",
};

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
