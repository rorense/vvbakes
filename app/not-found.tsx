import type { Metadata } from "next";
import Link from "next/link";
import { instagramUrl } from "@/lib/constants";
import { getSettings, isDemoMode } from "@/lib/queries";
import { DemoBanner } from "@/components/site/DemoBanner";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Container, Section } from "@/components/ui/Container";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { SkipLink } from "@/components/ui/SkipLink";

/**
 * The public 404.
 *
 * It rebuilds the site chrome by hand rather than inheriting it. A root
 * `not-found.tsx` renders inside app/layout.tsx only — the `(site)` group's
 * layout, and with it the header and footer, is never applied — so a dead link
 * would otherwise drop someone onto a bare page with no way back into the shop.
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

/** Where someone who landed here probably meant to go. */
const DESTINATIONS = [
	{
		href: "/shop",
		label: "The menu",
		body: "Cupcakes, cookies and Indonesian cakes, baked for the day you collect them.",
	},
	{
		href: "/order",
		label: "Start an order",
		body: "Ready-made off the menu, or a custom cake described in your own words.",
	},
	{
		href: "/#dates",
		label: "Baking dates",
		body: "The days I’m actually in the kitchen, and the next one that’s free.",
	},
];

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
				<Section
					tone="paper"
					size="loose"
					className="relative overflow-hidden">
					<div
						className="dot-field pointer-events-none absolute inset-0"
						aria-hidden="true"
					/>
					<Container className="relative">
						<div className="flex flex-col gap-6">
							<SectionLabel>Error 404</SectionLabel>

							<h1
								className="text-4xl"
								style={{ fontVariationSettings: '"SOFT" 40, "WONK" 1' }}>
								Nothing baking at this address.
							</h1>

							<p className="text-cocoa-soft max-w-lg text-lg">
								The link is either out of date or something I&rsquo;ve stopped making. Not your
								fault either way. Everything that&rsquo;s actually going in the oven is on the menu.
							</p>

							<div className="mt-2 flex flex-wrap gap-3">
								<ButtonLink
									href="/shop"
									size="lg">
									See the menu
								</ButtonLink>
								<ButtonLink
									href="/"
									variant="secondary"
									size="lg">
									Back to the start
								</ButtonLink>
							</div>
						</div>
					</Container>
				</Section>

				<Section tone="blush">
					<Container width="wide">
						<div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
							<div className="flex flex-col gap-4 lg:col-span-5">
								<SectionLabel>Try one of these</SectionLabel>
								<h2 className="font-display text-3xl">Somewhere that does exist</h2>
								<p className="text-cocoa-soft">
									Three places worth a look. If you were following a link from an order email, see
									the note underneath — those are easy to break in half.
								</p>
							</div>

							<div className="lg:col-span-7">
								<HairlineList>
									{DESTINATIONS.map((destination) => (
										<HairlineRow
											key={destination.href}
											align="start"
											className="flex-col gap-1 sm:flex-row sm:gap-8">
											<Link
												href={destination.href}
												className="text-sm font-medium underline underline-offset-4 sm:w-40 sm:shrink-0">
												{destination.label}
											</Link>
											<span className="text-cocoa-soft flex-1 text-sm">{destination.body}</span>
										</HairlineRow>
									))}
								</HairlineList>

								<p className="text-cocoa-soft mt-8 text-sm">
									<strong className="text-cocoa font-medium">
										Chasing an order you&rsquo;ve already placed?
									</strong>{" "}
									Your link never expires, so it has most likely been cut short or mistyped
									somewhere between the email and the address bar. Open it straight from the email I
									sent, or{" "}
									{settings.contactEmail ? (
										<a
											href={`mailto:${settings.contactEmail}`}
											className="underline underline-offset-4">
											email me
										</a>
									) : (
										<a
											href={instagramUrl(settings.instagramHandle)}
											target="_blank"
											rel="noopener noreferrer"
											className="underline underline-offset-4">
											message me on Instagram
										</a>
									)}{" "}
									and I&rsquo;ll send you a fresh one.
								</p>
							</div>
						</div>
					</Container>
				</Section>
			</main>

			<SiteFooter settings={settings} />
		</>
	);
}
