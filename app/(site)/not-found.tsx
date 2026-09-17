import type { Metadata } from "next";
import { getSettings } from "@/lib/queries";
import { NotFoundBody } from "@/components/site/NotFoundBody";

/**
 * What a page in this group shows when it calls `notFound()`: a bad order
 * token, a product slug that no longer exists, an unsubscribe link cut in half
 * by a mail client.
 *
 * Adds no header, no footer, no `<main>`. By the time a page inside the group
 * throws, app/(site)/layout.tsx has already rendered all three, and the
 * boundary renders inside it. Without this file the root boundary took these
 * as well and built a second header underneath the layout's, which is exactly
 * what the order 404 was showing.
 *
 * No `revalidate` either. This is only ever reached from a page that already
 * decided it had nothing to show, and every page that can reach it is
 * `force-dynamic`.
 */
export const metadata: Metadata = {
	title: "Page not found",
	description:
		"That page has moved or never existed. The menu, the order form and the baking dates are all one click away.",
};

export default async function SiteNotFound() {
	const settings = await getSettings();
	return <NotFoundBody settings={settings} />;
}
