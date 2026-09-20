import Link from "next/link";
import { instagramUrl } from "@/lib/constants";
import type { SiteSettings } from "@/lib/types";
import { ButtonLink } from "@/components/ui/Button";
import { Container, Section } from "@/components/ui/Container";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { SectionLabel } from "@/components/ui/SectionLabel";

/**
 * The 404 itself, with no site chrome around it.
 *
 * Shared because there are two not-found boundaries and they need opposite
 * things from their surroundings:
 *
 *   app/not-found.tsx          catches a URL that matches no route at all. It
 *                              renders inside app/layout.tsx and nothing else,
 *                              so it has to build the header and footer itself.
 *   app/(site)/not-found.tsx   catches `notFound()` thrown by a page inside the
 *                              group. The group's layout has already rendered,
 *                              header and all, so this one must add nothing.
 *
 * Getting that second case wrong is what put two headers on the page: the root
 * boundary was handling both, and in the second case its hand-built header
 * landed underneath the layout's. Everything either boundary has in common
 * lives here, so the two cannot drift into different 404s.
 *
 * No `<main>` in here for the same reason: the site layout supplies one, and
 * the root boundary adds its own.
 */

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

export function NotFoundBody({ settings }: { settings: SiteSettings }) {
	return (
		<>
			<Section
				tone="paper"
				size="loose">
				<Container>
					<div className="flex flex-col gap-6">
						<SectionLabel>Error 404</SectionLabel>

						<h1
							className="text-4xl"
							style={{ fontVariationSettings: '"SOFT" 40, "WONK" 1' }}>
							Nothing baking at this address.
						</h1>

						<p className="text-cocoa-soft max-w-lg text-lg">
							The link is either out of date or something I&rsquo;ve stopped making. Not your fault
							either way. Everything that&rsquo;s actually going in the oven is on the menu.
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
								Three places worth a look. If you were following a link from an order email, see the
								note underneath: those are easy to break in half.
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
								Your link never expires, so it has most likely been cut short or mistyped somewhere
								between the email and the address bar. Open it straight from the email I sent, or{" "}
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
		</>
	);
}
