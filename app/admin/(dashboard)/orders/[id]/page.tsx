import Link from "next/link";
import { notFound } from "next/navigation";
import {
	adminOrder,
	adminOrderCounts,
	adminOrderEvents,
	adminOrderReference,
	adminOverrides,
	adminProducts,
	adminRules,
	adminSettings,
} from "@/lib/admin-queries";
import { dayStanding, type ResolvedDay } from "@/lib/availability";
import { hasCustomFlavour } from "@/lib/brief";
import { cn } from "@/lib/cn";
import { formatDateLong, formatStamp } from "@/lib/dates";
import { lineLabel, menuChoices } from "@/lib/menu-choices";
import { allowedTransitions, STATUS_TONES } from "@/lib/order-status";
import { formatMoney } from "@/lib/pricing";
import { siteUrl } from "@/lib/constants";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";
import { AdminCard, AdminHeader } from "@/components/admin/AdminShell";
import { OrderActions } from "@/components/admin/OrderActions";
import { OrderDetails } from "@/components/admin/OrderDetails";
import { OrderItemsEditor } from "@/components/admin/OrderItemsEditor";
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

	// How the day this order sits on stands, read the same way every calendar in
	// the shop reads a day. Nothing here blocks anything: she can move an order
	// onto a Monday she never bakes on if that is what she has agreed with the
	// customer. It exists so that doing it by accident, or leaving an order on a
	// date she has since blocked, is something she finds out on the order rather
	// than on the morning.
	const [rules, overrides, counts, products] = await Promise.all([
		adminRules(),
		adminOverrides(order.pickupDate, order.pickupDate),
		adminOrderCounts(order.pickupDate, order.pickupDate),
		adminProducts(),
	]);

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
					<OrderItemsEditor
						orderId={order.id}
						lines={order.items.map((item) => ({
							id: item.id,
							label: lineLabel(item.productName, item.variantName),
							qty: item.qty,
						}))}
						menu={menuChoices(products)}
						editable={order.status !== "cancelled"}>
						<OrderLines
							order={order}
							unpricedLabel="Not priced yet"
							unpricedNote="That is the menu side only. Set a price for the custom work above and this becomes the total."
							// Bigger tiles: this is the copy she actually prices the cake
							// from, so the photos are the work rather than a reminder of it.
							tile="lg"
							showQuote
						/>
					</OrderItemsEditor>
				</AdminCard>

				<OrderDetails
					orderId={order.id}
					reference={order.reference}
					values={{
						pickupDate: order.pickupDate,
						pickupTime: order.pickupTime,
						fulfilment: order.fulfilment,
						customerName: order.customerName,
						customerEmail: order.customerEmail,
						customerPhone: order.customerPhone,
						deliveryAddress: order.deliveryAddress,
						notes: order.notes,
					}}
					deliveryEnabled={settings.deliveryEnabled}
					dateWarning={warnAboutDate(
						order.status,
						dayStanding({ date: order.pickupDate, rules, overrides, counts }),
					)}
					// Rendered here rather than in the client component because
					// `siteUrl()` reads a Vercel variable that is not public, so the
					// browser would build a localhost link out of it.
					orderPageLink={
						<>
							Their order page:{" "}
							<Link
								href={`/order/${order.token}`}
								className="underline underline-offset-2">
								{siteUrl()}/order/{order.token.slice(0, 8)}…
							</Link>
						</>
					}
				/>

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
									{formatStamp(event.createdAt, settings.timezone, true)}
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
 * What is wrong with the day this order sits on, in one sentence, or null.
 *
 * Said rather than enforced. The calendar's rules exist to stop a *customer*
 * booking a day that cannot be baked; she is the person who decides what can be
 * baked, and an order she has already agreed to move to a Monday is not
 * something the weekday rules get a vote on. What she does need is to not find
 * out on the morning.
 *
 * Cancelled orders say nothing, for the same reason `order_counts_between`
 * leaves them out: they are not on the day any more in the only sense that
 * matters.
 */
function warnAboutDate(status: OrderStatus, day: ResolvedDay): string | null {
	if (status === "cancelled") return null;

	if (!day.isOpen) {
		return day.hasOverride
			? "That date is blocked off on your calendar."
			: "You don't usually bake on that weekday.";
	}

	if (day.orderCount > day.capacity) {
		return `That date now has ${day.orderCount} order${day.orderCount === 1 ? "" : "s"} on it, against a capacity of ${day.capacity}.`;
	}

	return null;
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

/** What each correctable column is called in the history, in the order they are shown. */
const DETAIL_LABELS: Record<string, string> = {
	pickup_date: "the date",
	pickup_time: "the time",
	fulfilment: "pickup or delivery",
	customer_name: "the name",
	customer_email: "the email",
	customer_phone: "the phone",
	delivery_address: "the address",
	notes: "the allergies and notes",
	delivery_fee_cents: "the delivery fee",
};

/**
 * One field of a correction, as "the date, 2 October to 3 October".
 *
 * Both halves, because the whole point of the entry is that what was
 * overwritten is what the customer typed. Long values are cut short: the
 * allergies line can run to a paragraph, and a history row is one line.
 */
function describeChange(column: string, change: unknown): string {
	const label = DETAIL_LABELS[column] ?? column;
	if (typeof change !== "object" || change === null) return label;

	const { from, to } = change as { from?: unknown; to?: unknown };
	return `${label}, ${shorten(from)} to ${shorten(to)}`;
}

function shorten(value: unknown): string {
	if (value === null || value === undefined || value === "") return "blank";
	const text = String(value).replace(/\s+/g, " ").trim();
	return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

function describeEvent(type: string, data: Record<string, unknown>): string {
	switch (type) {
		case "created":
			return data.by === "owner" ? "Order put in by you" : "Order placed";
		case "status_changed":
			return `Moved from ${String(data.from)} to ${String(data.to)}${
				data.reason ? `: ${String(data.reason)}` : ""
			}`;
		// The owner correcting what a customer typed. `changes` is keyed by column
		// and carries both halves; anything unrecognised in there is still printed
		// under its column name rather than dropped.
		case "details_edited": {
			// The lines changing, which carries its own shape: each line with the
			// quantity before and after, 0 meaning added or taken off.
			if (Array.isArray(data.items)) {
				const lines = (data.items as Array<{ name?: unknown; from?: unknown; to?: unknown }>).map(
					({ name, from, to }) =>
						from === 0
							? `added ${String(to)} × ${String(name)}`
							: to === 0
								? `took off ${String(name)}`
								: `${String(name)}, ${String(from)} to ${String(to)}`,
				);
				const total = data.total_cents as { from?: unknown; to?: unknown } | undefined;
				return `Changed the items: ${lines.join("; ")}${
					total
						? `. Total ${formatMoney(Number(total.from))} to ${formatMoney(Number(total.to))}`
						: ""
				}`;
			}
			const changes = (data.changes ?? {}) as Record<string, unknown>;
			const described = Object.entries(changes).map(([column, change]) =>
				describeChange(column, change),
			);
			return described.length > 0 ? `Corrected ${described.join("; ")}` : "Corrected the details";
		}
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
		// `note` carries several unrelated things, so it is read by its contents.
		// Anything unrecognised keeps the old behaviour of printing the type,
		// which is what the quote notes have always shown.
		case "note":
			if (data.unsubscribed) {
				return data.source === "one-click"
					? "Asked not to be sent feedback requests, using their mail app's own button"
					: "Asked not to be sent feedback requests";
			}
			if (data.reason === "unsubscribed") {
				return "No feedback request sent: this address asked not to be";
			}
			return type;
		default:
			return type;
	}
}
