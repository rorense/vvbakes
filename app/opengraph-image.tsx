import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";
import { OG_CONTENT_TYPE, OG_SIZE, SITE_CARD, shareCard } from "@/lib/og";

/**
 * The card every page falls back to, and the one the home page uses.
 *
 * The private order pages have a card of their own beside them, which gives
 * away no more than the brand either: those links get pasted into group chats.
 */
export const alt = `${SITE_NAME}, ${SITE_TAGLINE}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
	return shareCard(SITE_CARD);
}
