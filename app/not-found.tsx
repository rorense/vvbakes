import type { Metadata } from "next";
import { getSettings, isDemoMode } from "@/lib/queries";
import { DemoBanner } from "@/components/site/DemoBanner";
import { NotFoundBody } from "@/components/site/NotFoundBody";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SkipLink } from "@/components/ui/SkipLink";

/**
 * A URL that matches no route at all.
 *
 * This one rebuilds the site chrome by hand, because a root `not-found.tsx`
 * renders inside app/layout.tsx and nothing else: the `(site)` group's layout
 * never runs, so without this a dead link would drop someone on a bare page
 * with no way back into the shop.
 *
 * It is NOT the boundary for a page that calls `notFound()` itself. Those live
 * inside the group, its layout has already rendered by the time they throw, and
 * they get app/(site)/not-found.tsx instead. This file used to handle both,
 * which is how the order and product 404s ended up with two headers stacked on
 * top of each other.
 *
 * There is no `robots` in the metadata below because Next already emits
 * `noindex` of its own on every 404 it renders, so declaring one again only
 * puts a second robots tag in the head.
 */

/**
 * Same window as the home page and the shop. Without it `/_not-found` is
 * prerendered once at build and never again, which would leave the footer
 * showing whatever the contact details were on the day of the last deploy.
 * Staying static also means a bot walking /wp-admin and friends costs nothing.
 */
export const revalidate = 300;

export const metadata: Metadata = {
	title: "Page not found",
	description:
		"That page has moved or never existed. The menu, the order form and the baking dates are all one click away.",
};

export default async function NotFound() {
	const settings = await getSettings();

	return (
		<>
			<SkipLink />
			{isDemoMode() ? <DemoBanner /> : null}
			<SiteHeader settings={settings} />

			<main id="main">
				<NotFoundBody settings={settings} />
			</main>

			<SiteFooter settings={settings} />
		</>
	);
}
