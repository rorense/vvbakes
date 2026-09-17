import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateLong } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { feedbackForOrder, getOrderByToken } from "@/lib/orders";
import { getSettings } from "@/lib/queries";
import { Container, Section } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { FeedbackForm } from "@/components/order/FeedbackForm";

export const dynamic = "force-dynamic";

/**
 * As with the status page it sits under, the token in the URL is the only thing
 * protecting this, so it must never be indexed.
 */
export const metadata: Metadata = {
	title: "How was it?",
	// Says nothing about who ordered or what. This is the text that previews
	// wherever the link gets pasted.
	description: "Tell vvbakes how your order went.",
	robots: { index: false, follow: false, nocache: true },
};

/**
 * Where the feedback email lands.
 *
 * Reached from one place (the link in that email) and gated by the same token
 * as the order's status page next door. There is no route to it from the site,
 * and there is deliberately no list of what other people said: this page asks,
 * it does not show.
 */
export default async function OrderFeedbackPage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	const order = await getOrderByToken(token);
	if (!order) notFound();

	const settings = await getSettings();

	// The email only goes to orders that are with their customer, but the link is
	// in an inbox and inboxes get read late and forwarded. Asking someone how
	// their cake was before they have it would be worse than not asking.
	if (order.status !== "collected" && order.status !== "ready") {
		return (
			<Shell>
				<div className="flex flex-col gap-3">
					<SectionLabel>Order {order.reference}</SectionLabel>
					<h1 className="font-display text-4xl">Not just yet</h1>
					<p className="text-cocoa-soft">
						{order.status === "cancelled"
							? "This order was called off, so there's nothing to look back on. If something went wrong, I'd still like to hear it: just reply to any of my emails."
							: `This one is booked for ${formatDateLong(order.pickupDate)}. I'll send you this link again once it's with you.`}
					</p>
				</div>
				<Link
					href={`/order/${order.token}`}
					className="w-fit text-sm font-medium underline underline-offset-4">
					Check your order
				</Link>
			</Shell>
		);
	}

	const existing = await feedbackForOrder(order.id);

	return (
		<Shell>
			<div className="flex flex-col gap-3">
				<SectionLabel>Order {order.reference}</SectionLabel>
				<h1 className="font-display text-4xl">How was it, {firstName(order.customerName)}?</h1>
				<p className="text-cocoa-soft">
					Your order from {formatDateLong(order.pickupDate)}. Two boxes, a minute of your time, and
					it genuinely helps a one-person kitchen.
				</p>
			</div>

			<FeedbackForm
				token={order.token}
				defaultAuthor={order.customerName}
				existing={existing}
			/>

			<div className="border-line flex flex-col gap-2 border-t pt-6">
				<p className="text-cocoa-soft text-xs">
					Nothing you write here goes up on its own. I read it first, and only what you&rsquo;ve
					said I can use is ever quoted.
				</p>
				{settings.contactEmail ? (
					<p className="text-cocoa-soft text-xs">
						Would rather say it privately?{" "}
						<a
							href={`mailto:${settings.contactEmail}?subject=${encodeURIComponent(`Order ${order.reference}`)}`}
							className="underline underline-offset-2">
							Email me
						</a>
						.
					</p>
				) : null}
				<Link
					href="/privacy"
					className="text-cocoa-soft text-xs underline underline-offset-2">
					What I do with your details
				</Link>
			</div>
		</Shell>
	);
}

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<Section
			tone="paper"
			size="tight">
			<Container width="narrow">
				<div className="flex flex-col gap-8">{children}</div>
			</Container>
		</Section>
	);
}
