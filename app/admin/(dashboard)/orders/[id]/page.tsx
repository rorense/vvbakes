import Link from "next/link";
import { notFound } from "next/navigation";
import {
	adminOrder,
	adminOrderEvents,
	adminOrderReference,
	adminSettings,
} from "@/lib/admin-queries";
import { hasCustomFlavour } from "@/lib/brief";
import { cn } from "@/lib/cn";
import { formatDateLong, formatDateLongWithTime } from "@/lib/dates";
import { allowedTransitions, STATUS_TONES } from "@/lib/order-status";
import { siteUrl } from "@/lib/constants";
import { ORDER_STATUS_LABELS } from "@/lib/types";
import { AdminCard, AdminHeader } from "@/components/admin/AdminShell";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { OrderActions } from "@/components/admin/OrderActions";
import { Inspiration } from "@/components/order/Inspiration";
import { OrderLines } from "@/components/order/OrderLines";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return { title: (await adminOrderReference(id)) ?? "Order" };
}

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const [order, events, settings] = await Promise.all([
		adminOrder(id),
		adminOrderEvents(id),
		adminSettings(),
	]);

	if (!order) notFound();

	// Three different problems, one conclusion: do not assume this customer has
	// been told anything. A send refused by Resend, a message that bounced after
	// it was accepted, and a recipient who marked it as spam.
	const emailProblem = events.find((event) => event.type in EMAIL_PROBLEM_HEADLINES);
	const hasInspiration = order.inspirationImagePaths.length > 0 || Boolean(order.inspirationUrl);

	return (
		<>
			<AdminHeader
				title={order.reference}
				description={`${order.customerName} · ${formatDateLong(order.pickupDate)}`}
				back={{ href: "/admin/orders", label: "Orders" }}
				action={
					<span
						className={cn(
							"rounded-pill px-3 py-1.5 text-sm font-medium",
							STATUS_TONES[order.status],
						)}>
						{ORDER_STATUS_LABELS[order.status]}
					</span>
				}
			/>

			<div className="flex flex-col gap-6">
				{emailProblem ? (
					<div className="border-danger bg-danger-tint text-danger rounded-lg border p-4 text-sm">
						<p className="font-medium">{EMAIL_PROBLEM_HEADLINES[emailProblem.type]}</p>
						<p className="mt-1">{describeEvent(emailProblem.type, emailProblem.data)}</p>
						<p className="mt-1">{EMAIL_PROBLEM_ADVICE[emailProblem.type]?.(order.customerEmail)}</p>
					</div>
				) : null}

				<OrderActions
					orderId={order.id}
					status={order.status}
					transitions={allowedTransitions(order.status)}
					internalNotes={order.internalNotes}
					customRequest={order.customRequest}
					// Rendered here rather than inside the client component so the
					// admin bundle does not have to carry the URL checks. Null when
					// they sent nothing, which is what decides whether the card shows.
					inspiration={
						hasInspiration ? (
							<Inspiration
								paths={order.inspirationImagePaths}
								url={order.inspirationUrl}
								tile="lg"
							/>
						) : null
					}
					// Read off the lines' own snapshot rather than off the products,
					// so an order placed as custom work goes on saying so even after
					// she un-ticks "price on request" on the product.
					needsQuote={order.items.some((item) => item.priceOnRequest)}
					// Opens the same card without demanding a number: a flavour of
					// their own on cupcakes that already have a price may cost her
					// nothing extra, and may cost her an afternoon.
					hasCustomFlavour={order.items.some(hasCustomFlavour)}
					quoteCents={order.quoteCents}
					totalCents={order.totalCents}
				/>

				<AdminCard title="Order">
					{order.items.length === 0 ? (
						<p className="text-cocoa-soft mb-4 text-sm">
							Nothing off the menu. This is the cake above.
						</p>
					) : null}
					<OrderLines
						order={order}
						unpricedLabel="Not priced yet"
						unpricedNote="That is the menu side only. Set a price for the custom work above and this becomes the total."
						// Bigger tiles: this is the copy she actually prices the cake
						// from, so the photos are the work rather than a reminder of it.
						tile="lg"
						showQuote
					/>
				</AdminCard>

				<AdminCard title="Customer">
					<HairlineList as="dl">
						<HairlineRow as="div">
							<dt className="text-cocoa-soft text-sm">Name</dt>
							<dd className="text-right text-sm font-medium">{order.customerName}</dd>
						</HairlineRow>
						<HairlineRow as="div">
							<dt className="text-cocoa-soft text-sm">Email</dt>
							<dd className="text-right text-sm font-medium">
								<a
									href={`mailto:${order.customerEmail}?subject=${encodeURIComponent(`Your vvbakes order ${order.reference}`)}`}
									className="underline underline-offset-2">
									{order.customerEmail}
								</a>
							</dd>
						</HairlineRow>
						<HairlineRow as="div">
							<dt className="text-cocoa-soft text-sm">Phone</dt>
							<dd className="text-right text-sm font-medium">
								<a
									href={`tel:${order.customerPhone.replace(/\s/g, "")}`}
									className="underline underline-offset-2">
									{order.customerPhone}
								</a>
							</dd>
						</HairlineRow>
						<HairlineRow as="div">
							<dt className="text-cocoa-soft text-sm">
								{order.fulfilment === "delivery" ? "Delivery" : "Pickup"}
							</dt>
							<dd className="text-right text-sm font-medium">
								{formatDateLongWithTime(order.pickupDate, order.pickupTime)}
							</dd>
						</HairlineRow>
						{order.deliveryAddress ? (
							<HairlineRow as="div">
								<dt className="text-cocoa-soft text-sm">Address</dt>
								<dd className="text-right text-sm font-medium">{order.deliveryAddress}</dd>
							</HairlineRow>
						) : null}
					</HairlineList>

					<p className="text-cocoa-soft mt-4 text-xs">
						Their order page:{" "}
						<Link
							href={`/order/${order.token}`}
							className="underline underline-offset-2">
							{siteUrl()}/order/{order.token.slice(0, 8)}…
						</Link>
					</p>
				</AdminCard>

				{order.notes ? (
					<AdminCard title="What they said">
						<p className="text-cocoa-soft text-2xs font-medium tracking-widest uppercase">
							Allergies and notes
						</p>
						<p className="mt-1 text-sm">{order.notes}</p>
					</AdminCard>
				) : null}

				<AdminCard title="History">
					<ul className="hairline-list">
						{events.map((event) => (
							<li
								key={event.id}
								className="flex items-baseline justify-between gap-4 py-3">
								<span className="text-sm">{describeEvent(event.type, event.data)}</span>
								<span className="text-cocoa-soft shrink-0 text-xs">
									{new Date(event.createdAt).toLocaleString("en-NZ", {
										timeZone: settings.timezone,
										dateStyle: "medium",
										timeStyle: "short",
									})}
								</span>
							</li>
						))}
					</ul>
				</AdminCard>
			</div>
		</>
	);
}

/**
 * The banner above the order, for the three events that mean the customer may
 * be sitting there having heard nothing. Keyed loosely, like describeEvent, so
 * an event type the build has not caught up with simply does not match.
 */
const EMAIL_PROBLEM_HEADLINES: Record<string, string> = {
	email_failed: "An email to this customer didn’t send.",
	email_bounced: "An email to this customer bounced.",
	email_complained: "This customer marked an email as spam.",
};

const EMAIL_PROBLEM_ADVICE: Record<string, (email: string) => string> = {
	email_failed: (email) => `You can resend it below, or contact them at ${email}.`,
	// Resending goes to the same address and bounces again. The address is the
	// thing to fix, and only she can, by asking them.
	email_bounced: (email) => `${email} would not take it. Check the address before resending.`,
	email_complained: () =>
		"Nothing to do for this order. Worth knowing, because enough of these stop the shop’s mail reaching anyone.",
};

function describeEvent(type: string, data: Record<string, unknown>): string {
	switch (type) {
		case "created":
			return "Order placed";
		case "status_changed":
			return `Moved from ${String(data.from)} to ${String(data.to)}${
				data.reason ? `: ${String(data.reason)}` : ""
			}`;
		case "email_sent":
			return `Sent the ${String(data.template)} email to ${String(data.to)}`;
		case "email_failed":
			return `The ${String(data.template)} email failed: ${String(
				data.error ?? data.skipped ?? "unknown reason",
			)}`;
		case "email_bounced":
			return `The ${String(data.template)} email bounced: ${String(data.reason ?? "no reason given")}`;
		case "email_complained":
			return `${String(data.to)} marked the ${String(data.template)} email as spam`;
		// What they wrote is deliberately not here. This log is append-only and a
		// customer who comes back to correct themselves would leave their first
		// draft in it for ever. The words live on /admin/feedback, where a
		// rewrite replaces them.
		case "feedback_received":
			return data.consented
				? "Left feedback, and said it may go on the website"
				: "Left feedback, just for you";
		default:
			return type;
	}
}
