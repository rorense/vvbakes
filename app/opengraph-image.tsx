import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";
import { OG_CONTENT_TYPE, OG_SIZE, shareCard } from "@/lib/og";

/**
 * The card every page falls back to, and the one the home page uses.
 *
 * It is also what the private order pages unfurl into, since they have no card
 * of their own — which is the point. Those links get pasted into group chats,
 * and the preview must give away no more than the brand.
 */
export const alt = `${SITE_NAME}, ${SITE_TAGLINE}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
	return shareCard({
		title: "Tell me what you’re celebrating. I’ll bake it.",
		body: "Small-batch cupcakes, cookies and Indonesian-inspired cakes, baked to order.",
	});
}
