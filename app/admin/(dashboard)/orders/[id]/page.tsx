import Link from "next/link";
import { notFound } from "next/navigation";
import {
	adminOrder,
	adminOrderEvents,
	adminOrderReference,
	adminSettings,
} from "@/lib/admin-queries";
import { cn } from "@/lib/cn";
import { formatDateLong } from "@/lib/dates";
import { allowedTransitions, STATUS_TONES } from "@/lib/order-status";
import { formatMoney } from "@/lib/pricing";
import { siteUrl } from "@/lib/constants";
import { ORDER_STATUS_LABELS } from "@/lib/types";
import { AdminCard, AdminHeader } from "@/components/admin/AdminShell";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { OrderActions } from "@/components/admin/OrderActions";

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

	const failedEmails = events.filter((event) => event.type === "email_failed");

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
				{failedEmails.length > 0 ? (
					<div className="border-danger bg-danger-tint text-danger rounded-lg border p-4 text-sm">
						<p className="font-medium">An email to this customer didn&rsquo;t send.</p>
						<p className="mt-1">
							{String(failedEmails[0]!.data.error ?? failedEmails[0]!.data.skipped ?? "")}
						</p>
						<p className="mt-1">
							You can resend it below, or contact them at {order.customerEmail}.
						</p>
					</div>
				) : null}

				<OrderActions
					orderId={order.id}
					status={order.status}
					transitions={allowedTransitions(order.status)}
					internalNotes={order.internalNotes}
					customRequest={order.customRequest}
					quoteCents={order.quoteCents}
					totalCents={order.totalCents}
				/>

				<AdminCard title="Order">
					{order.items.length === 0 ? (
						<p className="text-cocoa-soft mb-4 text-sm">
							Nothing off the menu. This is the cake above.
						</p>
					) : null}
					<HairlineList>
						{order.items.map((item) => (
							<HairlineRow
								key={item.id}
								align="start">
								<div className="flex flex-col gap-0.5">
									<span className="font-medium">
										{item.qty} &times; {item.productName}
									</span>
									{item.pricingNote ? (
										<span className="text-cocoa-soft text-xs">{item.pricingNote}</span>
									) : null}
								</div>
								<span className="shrink-0">{formatMoney(item.lineTotalCents)}</span>
							</HairlineRow>
						))}
						{order.deliveryFeeCents > 0 ? (
							<HairlineRow>
								<span className="text-cocoa-soft text-sm">Delivery</span>
								<span className="shrink-0 text-sm">{formatMoney(order.deliveryFeeCents)}</span>
							</HairlineRow>
						) : null}
						{order.quoteCents > 0 ? (
							<HairlineRow>
								<span className="text-cocoa-soft text-sm">Your price for the cake</span>
								<span className="shrink-0 text-sm">{formatMoney(order.quoteCents)}</span>
							</HairlineRow>
						) : null}
						<HairlineRow>
							<span className="font-medium">Total</span>
							<span
								className={
									order.totalCents === 0
										? "text-cocoa-soft shrink-0 text-sm"
										: "font-display shrink-0 text-2xl"
								}>
								{order.totalCents === 0 ? "Not priced yet" : formatMoney(order.totalCents)}
							</span>
						</HairlineRow>
					</HairlineList>
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
							<dd className="text-right text-sm font-medium">{formatDateLong(order.pickupDate)}</dd>
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
						{order.notes ? (
							<div className="mb-4">
								<p className="text-cocoa-soft text-2xs font-medium tracking-widest uppercase">
									Allergies and notes
								</p>
								<p className="mt-1 text-sm">{order.notes}</p>
							</div>
						) : null}
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
		default:
			return type;
	}
}
