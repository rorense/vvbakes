import type { Metadata } from "next";
import { buildPublicCalendar, computeAvailability } from "@/lib/availability";
import { getAvailabilityInputs } from "@/lib/queries";
import { SITE_CITY } from "@/lib/seo";
import { ButtonLink } from "@/components/ui/Button";
import { Container, Section } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { OrderForm } from "@/components/order/OrderForm";

/**
 * Always rendered fresh. The list of bookable dates depends on the clock, the
 * calendar and how many orders are already in, so a cached copy would offer
 * dates that have since filled up.
 */
export const dynamic = "force-dynamic";

/**
 * The one public page that is a form rather than something to be found. It is
 * kept in the sitemap because it is a real destination, but it is nobody's
 * search result, so the title stays the plain one and only the description
 * picks up the city.
 */
export const metadata: Metadata = {
	title: "Your order",
	description: `Check what you've picked, choose a pickup day in ${SITE_CITY}, and send it through. I'll confirm by email with a price and where to send it.`,
	alternates: { canonical: "/order" },
};

export default async function OrderPage({
	searchParams,
}: {
	searchParams: Promise<{ date?: string }>;
}) {
	const { date: requestedDate } = await searchParams;
	// One round trip rather than two. This page is never cached, so the wait is
	// the page.
	const { settings, products, rules, overrides, counts } = await getAvailabilityInputs();

	const availability = computeAvailability({ settings, rules, overrides, counts });

	if (!availability.ordersOpen) {
		return (
			<Section tone="paper">
				<Container width="narrow">
					<div className="flex flex-col items-start gap-4">
						<SectionLabel>Orders</SectionLabel>
						<h1 className="font-display text-3xl">The oven&rsquo;s off for now</h1>
						<p className="text-cocoa-soft">
							{settings.ordersClosedMessage ??
								"Taking a short break. Follow along on Instagram, that's where new dates go up first."}
						</p>
						<ButtonLink
							href="/shop"
							variant="secondary">
							Have a look anyway
						</ButtonLink>
					</div>
				</Container>
			</Section>
		);
	}

	return (
		<Section
			tone="paper"
			size="tight">
			<Container width="narrow">
				<div className="mb-10 flex flex-col gap-3">
					<SectionLabel>Your order</SectionLabel>
					<h1 className="font-display text-4xl">Let&rsquo;s get baking</h1>
					<p className="text-cocoa-soft">
						There&rsquo;s nothing to pay until we&rsquo;ve confirmed everything together. If you
						have any special requests, just let me know!
					</p>
				</div>

				<OrderForm
					products={products}
					dates={availability.dates}
					// The same grids the home page draws, so the calendar someone
					// clicked a day on and the one they now pick from are one thing.
					months={buildPublicCalendar({ settings, rules, overrides, counts })}
					settings={settings}
					// Someone who clicked a day on the home page's calendar has
					// already chosen; don't make them choose again.
					initialDate={
						requestedDate && availability.dates.some((d) => d.date === requestedDate)
							? requestedDate
							: null
					}
				/>
			</Container>
		</Section>
	);
}
