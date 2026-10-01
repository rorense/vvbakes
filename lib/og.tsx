import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { SITE_NAME, SITE_TAGLINE, siteUrl } from "./constants";

/**
 * The share card a link to this site unfurls into.
 *
 * One layout, used by every `opengraph-image` route: the badge and wordmark on
 * the left with whatever that page is about, an arched window on the right. The
 * arch holds the product photo where there is one and the badge where there is
 * not, so a card without a photo still looks designed rather than looking like
 * something failed to load.
 *
 * Twitter is not handled separately. Next fills `twitter:image` from
 * `openGraph.images` whenever a page has not set its own, so one file per route
 * covers both, and `twitter.card` is already `summary_large_image` on the root
 * layout.
 */

/** Facebook's and X's shared preferred size. Anything else gets letterboxed. */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/**
 * Brand tokens, spelled out rather than read from globals.css. Satori never sees
 * a stylesheet — it takes inline styles only — so the CSS variables in the theme
 * block are not reachable from here.
 */
const PAPER = "#fffbd9";
const BLUSH = "#fbe4e9";
const ROSE = "#f7ccd5";
const COCOA = "#442910";
const COCOA_SOFT = "#6e4b32";
const LINE = "rgba(68, 41, 16, 0.16)";

const FONT_FILES = [
	{ file: "Fraunces-SemiBold.ttf", name: "Fraunces", weight: 600 },
	{ file: "InstrumentSans-Regular.ttf", name: "Instrument Sans", weight: 400 },
	{ file: "InstrumentSans-SemiBold.ttf", name: "Instrument Sans", weight: 600 },
] as const;

/**
 * Read once per process, not once per card.
 *
 * Every product page renders its own card at build time, so without this the
 * same three font files are read from disk for each one.
 */
let fontsOnce: Promise<ConstructorParameters<typeof ImageResponse>[1]> | null = null;
function fonts() {
	fontsOnce ??= Promise.all(
		FONT_FILES.map(async ({ file, name, weight }) => ({
			name,
			weight,
			style: "normal" as const,
			data: await readFile(join(process.cwd(), "assets", "fonts", file)),
		})),
	).then((loaded) => ({ ...OG_SIZE, fonts: loaded }));
	return fontsOnce;
}

let logoOnce: Promise<string> | null = null;
function logo() {
	// public/logo.png rather than the source art: it is already trimmed of its
	// transparent margin, so the badge fills the circle it is placed in.
	logoOnce ??= readFile(join(process.cwd(), "public", "logo.png")).then(
		(bytes) => `data:image/png;base64,${bytes.toString("base64")}`,
	);
	return logoOnce;
}

/** A dot field, inlined as a data URL: Satori cannot follow a relative one. */
const DOTS = `data:image/svg+xml;utf8,${encodeURIComponent(
	`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
		`<circle cx="4" cy="4" r="1.5" fill="${COCOA}"/>` +
		`<circle cx="16" cy="16" r="1.5" fill="${COCOA}"/></svg>`,
)}`;

/** The arch at twice its drawn size, so the photo survives a retina timeline. */
const PHOTO_WIDTH = 760;
const PHOTO_HEIGHT = 980;

/**
 * A product photo, cropped to the arch and re-encoded as JPEG, or null.
 *
 * Two things make this more than a fetch. Product photos are uploaded as WebP,
 * and the renderer behind next/og cannot decode WebP — handing it one does not
 * drop the photo, it throws, and the page ships no preview at all. And Satori
 * would otherwise carry the full-size original through the render only to draw
 * it at 380px wide.
 *
 * So sharp does the crop and the format change here, where a photo that will not
 * load costs the card its photo and nothing else: the arch falls back to the
 * badge.
 */
async function photoData(url: string | null): Promise<string | null> {
	if (!url) return null;
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
		if (!response.ok) return null;

		const jpeg = await sharp(Buffer.from(await response.arrayBuffer()))
			.resize(PHOTO_WIDTH, PHOTO_HEIGHT, { fit: "cover" })
			.jpeg({ quality: 82 })
			.toBuffer();

		return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
	} catch {
		return null;
	}
}

/**
 * Long product names have to shrink or they run out of column.
 *
 * The top size is 60 rather than the 66 the column will just about take, so a
 * short headline lands on one line instead of breaking with a single word
 * stranded underneath.
 */
function titleSize(title: string): number {
	if (title.length > 44) return 46;
	if (title.length > 26) return 54;
	return 60;
}

/**
 * Two lines of supporting copy at 26px is about this many characters.
 *
 * A third line is not a disaster, but it closes the gap to the rule above the
 * domain, and a product with both a long name and a long description ends up
 * with no air anywhere. Cutting at the last word is what keeps it to two.
 */
function clamp(text: string, limit = 100): string {
	const flat = text.replace(/\s+/g, " ").trim();
	if (flat.length <= limit) return flat;

	const cut = flat.slice(0, limit);
	const lastSpace = cut.lastIndexOf(" ");
	const kept = lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut;
	return `${kept.replace(/[,.;:]$/, "")}…`;
}

/** The site's own card: the home page, and the fallback anywhere else. */
export const SITE_CARD = {
	title: "Tell me what you’re celebrating. I’ll bake it.",
	body: "Small-batch cupcakes, cookies and Indonesian-inspired cakes, baked to order.",
} as const;

export interface ShareCard {
	/** Small tracked label above the headline. Left out when there is nothing useful to say. */
	eyebrow?: string | null;
	/** The headline. Usually the page title, or the product name. */
	title: string;
	/** A line or two under it, trimmed to fit rather than wrapping forever. */
	body?: string | null;
	/** Absolute URL of a product photo to put in the arch. */
	photoUrl?: string | null;
}

export async function shareCard({ eyebrow, title, body, photoUrl }: ShareCard) {
	const [options, logoSrc, photoSrc] = await Promise.all([
		fonts(),
		logo(),
		photoData(photoUrl ?? null),
	]);

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				position: "relative",
				backgroundColor: PAPER,
				fontFamily: "Instrument Sans",
			}}>
			<div
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					width: "100%",
					height: "100%",
					backgroundImage: `url("${DOTS}")`,
					backgroundSize: "24px 24px",
					opacity: 0.06,
				}}
			/>
			{/* The band along the top edge, the same pink as the ring on the badge. */}
			<div
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					width: "100%",
					height: 14,
					backgroundColor: ROSE,
				}}
			/>

			<div style={{ display: "flex", width: "100%", height: "100%", padding: "76px 64px 64px" }}>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						flex: 1,
						justifyContent: "space-between",
						paddingRight: 56,
					}}>
					<div style={{ display: "flex", flexDirection: "column" }}>
						<div style={{ display: "flex", alignItems: "center", marginBottom: 34 }}>
							{/* Only when a photo has taken the arch. Otherwise the badge is already
							    the biggest thing on the card, and a second one beside the wordmark
							    reads as the same picture printed twice. */}
							{photoSrc ? (
								// eslint-disable-next-line @next/next/no-img-element -- Satori renders a plain img only.
								<img
									src={logoSrc}
									width={78}
									height={78}
									alt=""
									style={{ marginRight: 18 }}
								/>
							) : null}
							<div style={{ display: "flex", flexDirection: "column" }}>
								<div style={{ fontFamily: "Fraunces", fontSize: 31, color: COCOA, lineHeight: 1 }}>
									{SITE_NAME}
								</div>
								<div
									style={{
										fontSize: 15,
										fontWeight: 600,
										letterSpacing: "0.16em",
										textTransform: "uppercase",
										color: COCOA_SOFT,
										marginTop: 7,
									}}>
									{SITE_TAGLINE}
								</div>
							</div>
						</div>

						{eyebrow ? (
							<div
								style={{
									fontSize: 19,
									fontWeight: 600,
									letterSpacing: "0.16em",
									textTransform: "uppercase",
									color: COCOA_SOFT,
									marginBottom: 16,
								}}>
								{eyebrow}
							</div>
						) : null}

						<div
							style={{
								fontFamily: "Fraunces",
								fontSize: titleSize(title),
								color: COCOA,
								lineHeight: 1.06,
								letterSpacing: "-0.02em",
							}}>
							{title}
						</div>

						{body ? (
							<div
								style={{
									fontSize: 26,
									color: COCOA_SOFT,
									lineHeight: 1.45,
									marginTop: 22,
								}}>
								{clamp(body)}
							</div>
						) : null}
					</div>

					<div style={{ display: "flex", borderTop: `1px solid ${LINE}`, paddingTop: 22 }}>
						<div style={{ fontSize: 22, color: COCOA_SOFT }}>{new URL(siteUrl()).host}</div>
					</div>
				</div>

				{/* The arched shop window the site frames every photo in. */}
				<div
					style={{
						display: "flex",
						width: 380,
						height: 490,
						borderRadius: "190px 190px 12px 12px",
						backgroundColor: BLUSH,
						alignItems: "center",
						justifyContent: "center",
						overflow: "hidden",
					}}>
					{/* eslint-disable-next-line @next/next/no-img-element -- Satori renders a plain img only. */}
					<img
						src={photoSrc ?? logoSrc}
						alt=""
						width={photoSrc ? 380 : 268}
						height={photoSrc ? 490 : 268}
						style={photoSrc ? { objectFit: "cover" } : { marginTop: 54 }}
					/>
				</div>
			</div>
		</div>,
		options,
	);
}
