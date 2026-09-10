import type { Metadata } from "next";
import { computeAvailability } from "@/lib/availability";
import { addDays, todayIn } from "@/lib/dates";
import {
	getAvailabilityOverrides,
	getAvailabilityRules,
	getOrderCounts,
	getProducts,
	getSettings,
} from "@/lib/queries";
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

export const metadata: Metadata = {
	title: "Place an order",
	description:
		"Choose what you'd like and a pickup date. We'll confirm by email with payment details.",
};

export default async function OrderPage() {
	const settings = await getSettings();
	const today = todayIn(settings.timezone);
	const windowEnd = addDays(today, settings.bookingWindowDays);

	const [products, rules, overrides, counts] = await Promise.all([
		getProducts(),
		getAvailabilityRules(),
		getAvailabilityOverrides(today, windowEnd),
		getOrderCounts(today, windowEnd),
	]);

	const availability = computeAvailability({ settings, rules, overrides, counts });

	if (!availability.ordersOpen) {
		return (
			<Section tone="paper">
				<Container width="narrow">
					<div className="flex flex-col items-start gap-4">
						<SectionLabel>Orders</SectionLabel>
						<h1 className="font-display text-3xl">We&rsquo;ve paused new orders</h1>
						<p className="text-cocoa-soft">
							{settings.ordersClosedMessage ??
								"We're taking a short break. Follow along on Instagram and we'll post when we're back."}
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
					<h1 className="font-display text-4xl">Let&rsquo;s get this booked in</h1>
					<p className="text-cocoa-soft">
						Nothing is charged here. We&rsquo;ll check the date, confirm by email, and send you bank
						details and a reference.
					</p>
				</div>

				<OrderForm
					products={products}
					dates={availability.dates}
					settings={settings}
				/>
			</Container>
		</Section>
	);
}
