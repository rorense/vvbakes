/**
 * Vendors the two brand typefaces as TrueType files for the share-card renderer.
 *
 * The site itself gets Fraunces and Instrument Sans from next/font, which serves
 * woff2. Satori — the engine behind next/og — cannot read woff2, and the hashed
 * filenames next/font writes into .next are not something to reach into. So the
 * cards need their own copy, in a format Satori accepts, committed alongside the
 * code rather than fetched while a page is rendering.
 *
 * Google's CSS API decides which format to serve from the User-Agent. Android 4
 * predates woff2 and postdates EOT, which is the narrow window that gets a plain
 * .ttf back. Asking for one weight at a time returns a static instance of what is
 * really a variable font, which is what Satori wants: it renders a variable font
 * at its default weight and ignores the axis we care about.
 *
 * Run with: npm run og:fonts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(root, "assets", "fonts");

/** Old enough to be offered TrueType, new enough not to be offered EOT. */
const LEGACY_UA =
	"Mozilla/5.0 (Linux; U; Android 4.0.3; ko-kr; LG-L160L Build/IML74K) " +
	"AppleWebkit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30";

/** `query` is the css2 `family=` value; one weight each, so each file is a static instance. */
const FACES = [
	{ file: "Fraunces-SemiBold.ttf", query: "Fraunces:opsz,wght@9..144,600" },
	{ file: "InstrumentSans-Regular.ttf", query: "Instrument+Sans:wght@400" },
	{ file: "InstrumentSans-SemiBold.ttf", query: "Instrument+Sans:wght@600" },
];

async function fetchFace({ file, query }) {
	const css = await fetch(`https://fonts.googleapis.com/css2?family=${query}`, {
		headers: { "User-Agent": LEGACY_UA },
	});
	if (!css.ok) throw new Error(`${file}: css request failed with ${css.status}`);

	const url = (await css.text()).match(/src:\s*url\((https:\/\/[^)]+\.ttf)\)/)?.[1];
	if (!url) throw new Error(`${file}: no .ttf in the stylesheet — did the User-Agent rule change?`);

	const font = await fetch(url);
	if (!font.ok) throw new Error(`${file}: font request failed with ${font.status}`);

	const bytes = Buffer.from(await font.arrayBuffer());
	// Every TrueType file opens with one of these two tags. Anything else means
	// Google served a format Satori will choke on, and silently writing it would
	// only surface as a blank card much later.
	const tag = bytes.subarray(0, 4).toString("hex");
	if (tag !== "00010000" && tag !== "74727565") {
		throw new Error(`${file}: not TrueType (starts with 0x${tag})`);
	}

	await writeFile(join(OUT_DIR, file), bytes);
	console.log(`${file} — ${(bytes.length / 1024).toFixed(0)} KB`);
}

async function main() {
	await mkdir(OUT_DIR, { recursive: true });
	for (const face of FACES) await fetchFace(face);
	console.log("fonts vendored");
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
