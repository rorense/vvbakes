/**
 * Renders every transactional email to HTML with sample data, so the templates
 * can be checked without a database or an SMTP server.
 *
 *   npx tsx scripts/preview-emails.mts [outDir]
 *
 * Files land in .email-preview/ by default (gitignored). Open them in a browser.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { render } from "@react-email/render";
import { SUBJECTS, TEMPLATES, type EmailContext, type TemplateName } from "../emails/templates";
import type { Order, PrivateSettings, SiteSettings } from "../lib/types";

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
	subtotalCents: 2000,
	deliveryFeeCents: 0,
	quoteCents: 0,
	totalCents: 2000,
	internalNotes: null,
	cancellationReason: "I'm unwell and can't bake that weekend. So sorry.",
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
	pickupWindowText: "Pickups 4–7pm",
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

const context: EmailContext = {
	order,
	settings,
	privateSettings,
	siteUrl: "https://vvbakes.example",
};

/**
 * A custom cake: nothing off the menu, priced by the baker after she read the
 * request. This is the shape most of her orders take.
 */
const customOrder: Order = {
	...order,
	reference: "VV1043",
	token: "abcdef0123456789abcdef0123456789",
	items: [],
	subtotalCents: 0,
	quoteCents: 8500,
	totalCents: 8500,
	customRequest:
		"30th birthday, about 12 people. Chocolate, not too sweet. Pale pink if you can, and 'Happy Birthday Sam' on top.",
	notes: "One guest is allergic to walnuts.",
};

const outDir = process.argv[2] ?? ".email-preview";
await mkdir(outDir, { recursive: true });

const index: string[] = [];

const scenarios: Array<{ suffix: string; ctx: EmailContext }> = [
	{ suffix: "", ctx: context },
	{ suffix: "-custom", ctx: { ...context, order: customOrder } },
];

for (const { suffix, ctx } of scenarios)
	for (const name of Object.keys(TEMPLATES) as TemplateName[]) {
		const element = TEMPLATES[name](ctx);
		const html = await render(element);
		const text = await render(element, { plainText: true });

		await writeFile(join(outDir, `${name}${suffix}.html`), html, "utf8");
		await writeFile(join(outDir, `${name}${suffix}.txt`), text, "utf8");

		const subject = SUBJECTS[name](ctx);
		index.push(
			`<li><a href="./${name}${suffix}.html">${name}${suffix}</a>: <em>${subject}</em></li>`,
		);
		console.log(`${name}${suffix}\n  subject: ${subject}`);
	}

await writeFile(
	join(outDir, "index.html"),
	`<!doctype html><meta charset="utf-8"><title>vvbakes email previews</title>
<body style="font-family:system-ui;background:#FFF8EA;color:#442910;padding:2rem">
<h1>Email previews</h1><ul>${index.join("")}</ul></body>`,
	"utf8",
);

console.log(`\nWrote ${index.length} previews to ${outDir}/`);
