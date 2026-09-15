import type { Metadata } from "next";
import { Roboto } from "next/font/google";

/**
 * The market menu card keeps its original Roboto typography, so it loads its own
 * font rather than the site's Fraunces/Instrument pairing. It also skips the site
 * header and footer entirely, it is a standalone card, not a page of the site.
 */
const roboto = Roboto({
	subsets: ["latin"],
	weight: ["300", "400", "500", "700"],
	style: ["normal", "italic"],
	display: "swap",
	variable: "--font-roboto",
});

export const metadata: Metadata = {
	// `absolute` opts out of the root's "%s | vvbakes" template, which would
	// otherwise set the brand twice over: "vvbakes menu | vvbakes".
	title: { absolute: "vvbakes menu" },
	description: "The card handed out at the market: what's on the table, and what it costs.",
	robots: { index: false, follow: false },
};

export default function MenuLayout({ children }: { children: React.ReactNode }) {
	return <div className={roboto.className}>{children}</div>;
}
