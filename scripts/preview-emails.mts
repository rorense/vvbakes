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
import {
	customCakeOrder,
	customOrder,
	order,
	privateSettings,
	settings,
} from "./example-order.mjs";

const context: EmailContext = {
	order,
	settings,
	privateSettings,
	// The header badge is a real image served out of public/, so previews point at
	// a running dev server by default. Override with PREVIEW_SITE_URL.
	siteUrl: process.env.PREVIEW_SITE_URL ?? "http://localhost:3000",
};

const outDir = process.argv[2] ?? ".email-preview";
await mkdir(outDir, { recursive: true });

const index: string[] = [];

const scenarios: Array<{ suffix: string; ctx: EmailContext }> = [
	{ suffix: "", ctx: context },
	// The custom cake as it is ordered now: a line on the order, with no price
	// on it until she sets one. This is the awkward one to render — a real
	// subtotal that is not the whole total, so the figure reads "So far" and the
	// unpriced line reads "—" rather than $0.00.
	{ suffix: "-custom-cake", ctx: { ...context, order: customCakeOrder } },
	// And as it was ordered before it was a product: no lines at all, the whole
	// brief on the order itself. Nothing writes these any more, but the orders
	// that carry one are still rendered from those columns.
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
