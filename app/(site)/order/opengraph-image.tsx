import { OG_CONTENT_TYPE, OG_SIZE, shareCard } from "@/lib/og";

/**
 * The order form's card. A parent's card is inherited by every segment under it,
 * so the order-status pages would otherwise unfurl as an invitation to place an
 * order they have already placed — they declare one of their own next door.
 */
export const alt = "Place an order with vvbakes";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
	return shareCard({
		eyebrow: "Order",
		title: "Let’s get baking",
		body: "Pick a day, tell me what you’re after, and I’ll confirm by email. Nothing is charged here.",
	});
}
