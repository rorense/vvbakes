import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderByToken } from "@/lib/orders";
import { getSettings } from "@/lib/queries";
import { hasOptedOut } from "@/lib/optouts";
import { Container, Section } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { UnsubscribeForm } from "@/components/order/UnsubscribeForm";

export const dynamic = "force-dynamic";

/**
 * Carries an order token, so it is held out of search for the same reason the
 * order and feedback pages are.
 */
export const metadata: Metadata = {
	title: "Stop these emails",
	description: "Ask vvbakes not to send feedback requests.",
	robots: { index: false, follow: false, nocache: true },
};

/**
 * Where the unsubscribe link in the feedback email lands.
 *
 * Loading this page changes nothing. That is the whole design of it: the
 * address is printed in an email, mail scanners open every URL they find, and
 * an unsubscribe that fired on GET would quietly mute people who never touched
 * it. The button posts. The other half of the pair, the POST-only route at
 * /api/unsubscribe/[token], is what a mail client's own button calls, and that
 * one acts immediately because no scanner posts.
 */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
	const { token } = await params;
	const order = await getOrderByToken(token);
	if (!order) notFound();

	const [settings, alreadyOff] = await Promise.all([
		getSettings(),
		hasOptedOut(order.customerEmail),
	]);

	return (
		<Section
			tone="paper"
			size="tight">
			<Container width="narrow">
				<div className="flex flex-col gap-8">
					<div className="flex flex-col gap-3">
						<SectionLabel>Email settings</SectionLabel>
						<h1 className="font-display text-4xl">Not another word</h1>
						<p className="text-cocoa-soft">
							One email goes out the day after you collect an order, asking how it went. You can
							turn that off here and keep everything else.
						</p>
					</div>

					<UnsubscribeForm
						token={order.token}
						email={order.customerEmail}
						alreadyOff={alreadyOff}
					/>

					<div className="border-line flex flex-col gap-2 border-t pt-6">
						{settings.contactEmail ? (
							<p className="text-cocoa-soft text-xs">
								Would rather sort it by hand?{" "}
								<a
									href={`mailto:${settings.contactEmail}?subject=${encodeURIComponent("Unsubscribe")}`}
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
				</div>
			</Container>
		</Section>
	);
}
