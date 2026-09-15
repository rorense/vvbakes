/**
 * Generates every derived image asset from the source logo:
 *   public/logo.png               – trimmed, 800px, for use in pages
 *   public/hero-badge.png         – the badge minus its pink ring, for the hero arch
 *   app/icon.png                  – 512px favicon (Next serves + resizes)
 *   app/apple-icon.png            – 180px, cream background (iOS ignores alpha)
 *   public/icon-192.png / -512.png – PWA manifest icons
 *   public/email-logo.png         – 144px on cream, for the email header
 *
 * The social share cards are not here. They are drawn at request time by the
 * opengraph-image routes, from lib/og.tsx, because a card carries the name of
 * whichever page was shared and products come and go without anyone running a
 * script.
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

/**
 * Finds the yellow disc that sits inside the badge's pink ring, by walking the
 * middle row out from the centre until the yellow stops. Returns the square it
 * fits in, which is also the crop for the hero badge.
 */
async function innerDisc(png) {
	const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	const { width, height, channels } = info;
	const row = height >> 1;
	const isYellow = (x) => {
		const i = (row * width + x) * channels;
		return data[i + 3] > 200 && data[i] > 245 && data[i + 1] > 240 && data[i + 2] < 225;
	};

	let left = 0;
	let right = width - 1;
	while (left < right && !isYellow(left)) left++;
	while (right > left && !isYellow(right)) right--;

	const size = right - left + 1;
	if (size < width / 2)
		throw new Error(`inner disc looks wrong: ${size}px across a ${width}px badge`);
	// The badge is drawn round, so the disc is as tall as it is wide.
	return { left, top: Math.round((height - size) / 2), size };
}

async function main() {
	// The source PNG has ~170px of transparent margin on every side. Trim it so the
	// badge fills its box, then work from that as the master.
	const trimmed = await sharp(SOURCE).trim({ threshold: 1 }).png().toBuffer();
	const { width, height } = await sharp(trimmed).metadata();
	console.log(`source trimmed to ${width}x${height}`);

	// Page logo, transparent, 800px wide. No WebP twin: every use goes through
	// next/image, which already serves WebP (see `formats` in next.config.ts).
	await sharp(trimmed)
		.resize({ width: 800, withoutEnlargement: true })
		.png({ compressionLevel: 9, palette: true })
		.toFile(await out(join(root, "public", "logo.png")));

	// Hero badge. The hero arch is filled edge to edge by this image, so it wants
	// the artwork without the pink ring: mask to the yellow disc inside the ring,
	// crop to it, and leave the corners transparent for the arch's butter ground to
	// carry. The ring is measured rather than assumed, so a redrawn logo with a
	// thicker or thinner ring still comes out right.
	const page = await sharp(trimmed)
		.resize({ width: 800, withoutEnlargement: true })
		.png()
		.toBuffer();
	const disc = await innerDisc(page);
	const mask = Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${disc.size}" height="${disc.size}">` +
			// A hair inside the measured radius, so none of the ring's antialiased edge survives.
			`<circle cx="${disc.size / 2}" cy="${disc.size / 2}" r="${disc.size / 2 - 1}" fill="#fff" /></svg>`,
	);
	await sharp(page)
		.extract({ left: disc.left, top: disc.top, width: disc.size, height: disc.size })
		.composite([{ input: mask, blend: "dest-in" }])
		.png({ compressionLevel: 9 })
		.toFile(await out(join(root, "public", "hero-badge.png")));
	console.log(`hero badge cropped to ${disc.size}x${disc.size}`);

	// Favicon. Next.js resizes app/icon.png for every size it needs.
	await sharp(trimmed)
		.resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.png()
		.toFile(await out(join(root, "app", "icon.png")));

	// Apple touch icon, must be opaque with a little breathing room.
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

	// Email header badge. Mail clients cannot use next/image, so this is sized for
	// the 72px it is displayed at and flattened onto paper: a transparent PNG picks
	// up whatever ground a dark-mode client paints behind it, which is rarely cream.
	await sharp(trimmed)
		.resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.extend({ top: 8, bottom: 8, left: 8, right: 8, background: PAPER })
		.flatten({ background: PAPER })
		.png()
		.toFile(await out(join(root, "public", "email-logo.png")));

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
