/**
 * Generates every derived image asset from the source logo:
 *   public/logo.png / logo.webp   – trimmed, 800px, for use in pages
 *   app/icon.png                  – 512px favicon (Next serves + resizes)
 *   app/apple-icon.png            – 180px, cream background (iOS ignores alpha)
 *   public/icon-192.png / -512.png – PWA manifest icons
 *   app/opengraph-image.png       – 1200x630 social card
 *   emails/logo.png               – 240px for email templates
 *
 * Run with: npm run icons
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "assets", "logo-source.png");

/** Brand tokens duplicated here so the script has no runtime dependency on the app. */
const PAPER = { r: 0xff, g: 0xf8, b: 0xea, alpha: 1 };
const COCOA = "#442910";

async function out(path) {
	await mkdir(dirname(path), { recursive: true });
	return path;
}

async function main() {
	// The source PNG has ~170px of transparent margin on every side. Trim it so the
	// badge fills its box, then work from that as the master.
	const trimmed = await sharp(SOURCE).trim({ threshold: 1 }).png().toBuffer();
	const { width, height } = await sharp(trimmed).metadata();
	console.log(`source trimmed to ${width}x${height}`);

	// Page logo — transparent, 800px wide.
	await sharp(trimmed)
		.resize({ width: 800, withoutEnlargement: true })
		.png({ compressionLevel: 9, palette: true })
		.toFile(await out(join(root, "public", "logo.png")));
	await sharp(trimmed)
		.resize({ width: 800, withoutEnlargement: true })
		.webp({ quality: 88 })
		.toFile(await out(join(root, "public", "logo.webp")));

	// Email logo — small, flattened onto paper because email clients vary on alpha.
	await sharp(trimmed)
		.resize({ width: 240 })
		.flatten({ background: PAPER })
		.png()
		.toFile(await out(join(root, "emails", "logo.png")));

	// Favicon — Next.js resizes app/icon.png for every size it needs.
	await sharp(trimmed)
		.resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toFile(await out(join(root, "app", "icon.png")));

	// Apple touch icon — must be opaque with a little breathing room.
	await sharp(trimmed)
		.resize(160, 160, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.extend({ top: 10, bottom: 10, left: 10, right: 10, background: PAPER })
		.flatten({ background: PAPER })
		.png()
		.toFile(await out(join(root, "app", "apple-icon.png")));

	// PWA manifest icons.
	for (const size of [192, 512]) {
		await sharp(trimmed)
			.resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
			.png()
			.toFile(await out(join(root, "public", `icon-${size}.png`)));
	}

	// Open Graph card: logo centred on paper with the wordmark underneath.
	const OG_W = 1200;
	const OG_H = 630;
	const badge = await sharp(trimmed).resize({ height: 340 }).png().toBuffer();
	const badgeMeta = await sharp(badge).metadata();
	const caption = Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="120">
			<text x="50%" y="52" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
				font-size="52" font-weight="600" fill="${COCOA}">vvbakes</text>
			<text x="50%" y="96" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
				font-size="26" font-style="italic" fill="${COCOA}" opacity="0.75">inspired desserts</text>
		</svg>`,
	);

	await sharp({
		create: { width: OG_W, height: OG_H, channels: 4, background: PAPER },
	})
		.composite([
			{
				input: badge,
				top: 90,
				left: Math.round((OG_W - (badgeMeta.width ?? 340)) / 2),
			},
			{ input: caption, top: 460, left: 0 },
		])
		.png()
		.toFile(await out(join(root, "app", "opengraph-image.png")));

	// A tiny dot pattern used behind hero and category bands.
	await writeFile(
		await out(join(root, "public", "patterns", "dots.svg")),
		`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
	<circle cx="4" cy="4" r="1.5" fill="${COCOA}" />
	<circle cx="16" cy="16" r="1.5" fill="${COCOA}" />
</svg>
`,
	);

	console.log("icons built");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
