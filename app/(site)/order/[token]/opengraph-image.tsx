import { OG_CONTENT_TYPE, OG_SIZE, shareCard } from "@/lib/og";

/**
 * The card for a status link, and for the thank-you page under it.
 *
 * `noindex` keeps this page out of search but does nothing about previews: the
 * link gets pasted into a group chat and the card renders there regardless. So,
 * like the description it sits beside, it deliberately names neither the
 * customer nor what they ordered. It takes no `params` for the same reason.
 */
export const alt = "Your vvbakes order";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
	return shareCard({
		eyebrow: "Order status",
		title: "Your order",
		body: "Where your vvbakes order has got to, and what happens next.",
	});
}
