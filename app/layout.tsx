import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import { SITE_NAME, SITE_TAGLINE, siteUrl } from "@/lib/constants";
import "./globals.css";

/**
 * Fraunces carries the brand: a soft, slightly wonky old-style serif that reads
 * as a hand-set bakery sign rather than a web font. SOFT and WONK are dialled
 * in per use via font-variation-settings.
 */
const fraunces = Fraunces({
	subsets: ["latin"],
	display: "swap",
	axes: ["SOFT", "WONK", "opsz"],
	variable: "--font-fraunces",
});

const instrumentSans = Instrument_Sans({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-instrument-sans",
});

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl()),
	title: {
		default: `${SITE_NAME} — ${SITE_TAGLINE}`,
		template: `%s — ${SITE_NAME}`,
	},
	description:
		"Small-batch cupcakes, cookies and Indonesian-inspired cakes, baked to order. Choose a pickup date and we'll confirm by email.",
	applicationName: SITE_NAME,
	openGraph: {
		type: "website",
		siteName: SITE_NAME,
		locale: "en_NZ",
	},
	twitter: { card: "summary_large_image" },
	formatDetection: { telephone: false },
};

export const viewport: Viewport = {
	themeColor: "#fff8ea",
	colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html
			lang="en-NZ"
			className={`${fraunces.variable} ${instrumentSans.variable}`}>
			<body>{children}</body>
		</html>
	);
}
