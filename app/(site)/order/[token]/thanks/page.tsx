import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { formatDateLong } from "@/lib/dates";
import { getOrderByToken } from "@/lib/orders";
import { getSettings } from "@/lib/queries";
import { ArchFrame } from "@/components/ui/ArchFrame";
import { ButtonLink } from "@/components/ui/Button";
import { Container, Section } from "@/components/ui/Container";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Sticker } from "@/components/ui/Sticker";

export const dynamic = "force-dynamic";

/**
 * The token in the URL is the only thing protecting this page, so, exactly as
 * with the status page next door, it must never be indexed.
 */
export const metadata: Metadata = {
	title: "Thank you",
	description: "Your request is in. I'll email to confirm the day and the price.",
	robots: { index: false, follow: false, nocache: true },
};

/** How the emails address a customer. Kept the same here. */
const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

/**
 * The moment after the order form is sent.
 *
 * Everything lasting about an order lives on the status page next door; this is
 * the slip handed over the counter, and it has one job — say the request landed,
 * and point at the two places it can be followed up: the status link and the
 * email. So it is the badge, the reference, the date, and nothing else.
 */
export default async function OrderThanksPage({ params }: { params: Promise<{ token: string }> }) {
	const { token } = await params;
	const order = await getOrderByToken(token);
	if (!order) notFound();

	// Only a brand new order is being thanked for. Someone coming back to a
	// bookmarked link days later wants the status page, which knows whether the
	// order was confirmed, is waiting to be collected, or was called off.
	if (order.status !== "new") redirect(`/order/${order.token}`);

	const settings = await getSettings();
	const isDelivery = order.fulfilment === "delivery";

	return (
		<Section tone="paper">
			<Container width="narrow">
				<div className="flex flex-col items-center gap-9 text-center">
					{/* The badge, framed the way the home page frames it. There is no
					    photograph of a cake that doesn't exist yet, so the logo is the
					    picture, with the reference stuck to it like a box label. */}
					<div className="relative">
						<ArchFrame
							tone="blush"
							className="aspect-4/5 w-40 sm:w-48">
							<div className="flex h-full items-center justify-center p-6">
								<Image
									src="/logo.png"
									alt=""
									aria-hidden="true"
									width={800}
									height={800}
									sizes="192px"
									className="w-full max-w-32"
									priority
								/>
							</div>
						</ArchFrame>

						<div className="absolute -right-6 -bottom-5 sm:-right-10">
							<Sticker
								tone="rose-deep"
								size="sm">
								order
								<br />
								<span className="font-display text-sm">{order.reference}</span>
							</Sticker>
						</div>
					</div>

					<div className="flex flex-col gap-3">
						<SectionLabel>Order sent</SectionLabel>
						<h1 className="font-display text-4xl">Thank you, {firstName(order.customerName)}</h1>
						<p className="text-cocoa-soft">
							I&rsquo;ve got your request. Nothing is charged yet: I&rsquo;ll check the day, come
							back to you with a price, and send bank details then.
						</p>
					</div>

					<HairlineList
						as="dl"
						className="w-full text-left">
						<HairlineRow as="div">
							<dt className="text-cocoa-soft text-sm">Reference</dt>
							<dd className="text-right text-sm font-medium">{order.reference}</dd>
						</HairlineRow>
						<HairlineRow as="div">
							<dt className="text-cocoa-soft text-sm">
								{isDelivery ? "Delivery date" : "Pickup date"}
							</dt>
							<dd className="text-right text-sm font-medium">{formatDateLong(order.pickupDate)}</dd>
						</HairlineRow>
						<HairlineRow as="div">
							<dt className="text-cocoa-soft text-sm">Confirmation sent to</dt>
							<dd className="text-right text-sm font-medium break-all">{order.customerEmail}</dd>
						</HairlineRow>
					</HairlineList>

					<div className="flex flex-col items-center gap-4">
						<div className="flex flex-wrap justify-center gap-3">
							<ButtonLink
								href={`/order/${order.token}`}
								size="lg">
								Check your order
							</ButtonLink>
							<ButtonLink
								href="/shop"
								variant="secondary"
								size="lg">
								Back to the shop
							</ButtonLink>
						</div>
						<p className="text-cocoa-soft text-xs">
							That link is in your email as well. Keep it, it&rsquo;s how you check on your order.
							Nothing arrived? Have a look in your spam folder
							{settings.contactEmail ? (
								<>
									, then{" "}
									<a
										href={`mailto:${settings.contactEmail}?subject=${encodeURIComponent(`Order ${order.reference}`)}`}
										className="underline underline-offset-2">
										email me
									</a>
								</>
							) : null}
							.
						</p>
					</div>
				</div>
			</Container>
		</Section>
	);
}
