import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@/lib/cn";
import { formatDateLong } from "@/lib/dates";
import { getOrderByToken, getPrivateSettings } from "@/lib/orders";
import { formatMoney } from "@/lib/pricing";
import { getSettings } from "@/lib/queries";
import {
	ORDER_STATUS_LABELS,
	ORDER_TIMELINE,
	type Order,
	type OrderStatus,
	type PrivateSettings,
	type SiteSettings,
} from "@/lib/types";
import { Container, Section } from "@/components/ui/Container";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { CopyValue } from "@/components/order/CopyValue";

export const dynamic = "force-dynamic";

/**
 * The token in the URL is the only thing protecting this page, so it must never
 * be indexed or turn up in a referrer-driven crawl.
 */
export const metadata: Metadata = {
	title: "Your order",
	robots: { index: false, follow: false, nocache: true },
};

const STATUS_COPY: Record<OrderStatus, { heading: string; body: string }> = {
	new: {
		heading: "We’ve got your request",
		body: "Nothing to do yet. We're checking the date and we'll email you to confirm, with payment details.",
	},
	confirmed: {
		heading: "Your order is confirmed",
		body: "Please transfer the total using the reference below. Everything will be ready on the day.",
	},
	ready: {
		heading: "Your order is ready",
		body: "It's boxed up and waiting for you.",
	},
	collected: {
		heading: "Collected — thank you",
		body: "Thanks for supporting vvbakes. We hope it was good.",
	},
	cancelled: {
		heading: "This order was cancelled",
		body: "If you've already paid, get in touch and we'll refund you.",
	},
};

export default async function OrderStatusPage({ params }: { params: Promise<{ token: string }> }) {
	const { token } = await params;
	const order = await getOrderByToken(token);
	if (!order) notFound();

	const [settings, privateSettings] = await Promise.all([getSettings(), getPrivateSettings()]);

	// Bank details and the full street address only exist for a customer once
	// their order has actually been confirmed. Before that there is nothing to
	// pay and nowhere to turn up to.
	const isConfirmed =
		order.status === "confirmed" || order.status === "ready" || order.status === "collected";

	const copy = STATUS_COPY[order.status];

	return (
		<Section
			tone="paper"
			size="tight">
			<Container width="narrow">
				<div className="flex flex-col gap-8">
					<div className="flex flex-col gap-3">
						<SectionLabel>Order {order.reference}</SectionLabel>
						<h1 className="font-display text-4xl">{copy.heading}</h1>
						<p className="text-cocoa-soft">{copy.body}</p>
					</div>

					{order.status !== "cancelled" ? <Timeline status={order.status} /> : null}

					{order.status === "cancelled" && order.cancellationReason ? (
						<p className="border-line bg-paper-deep rounded-md border px-4 py-3 text-sm">
							{order.cancellationReason}
						</p>
					) : null}

					{/* The receipt itself, on cream with a torn foot. */}
					<div className="bg-paper-deep torn-edge rounded-t-lg px-6 pt-6 pb-10 sm:px-8 sm:pt-8">
						<SectionLabel as="h2">Your order</SectionLabel>
						<HairlineList className="mt-3">
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

							<HairlineRow>
								<span className="font-medium">Total</span>
								<span className="font-display shrink-0 text-2xl">
									{formatMoney(order.totalCents)}
								</span>
							</HairlineRow>
						</HairlineList>
					</div>

					<Fulfilment
						order={order}
						settings={settings}
						privateSettings={privateSettings}
						showPrivate={isConfirmed}
					/>

					{isConfirmed && privateSettings.bankAccountNumber ? (
						<Payment
							order={order}
							privateSettings={privateSettings}
						/>
					) : null}

					{order.notes || order.customRequest ? (
						<div className="flex flex-col gap-3">
							<SectionLabel as="h2">What you told us</SectionLabel>
							{order.notes ? <p className="text-sm">{order.notes}</p> : null}
							{order.customRequest ? <p className="text-sm">{order.customRequest}</p> : null}
						</div>
					) : null}

					<div className="border-line flex flex-col gap-2 border-t pt-6">
						<p className="text-cocoa-soft text-xs">
							Keep this link — it&rsquo;s how you check on your order. We&rsquo;ll also email you at{" "}
							{order.customerEmail}.
						</p>
						{settings.contactEmail ? (
							<p className="text-cocoa-soft text-xs">
								Something not right?{" "}
								<a
									href={`mailto:${settings.contactEmail}?subject=${encodeURIComponent(`Order ${order.reference}`)}`}
									className="underline underline-offset-2">
									Email us
								</a>
								.
							</p>
						) : null}
						<Link
							href="/shop"
							className="mt-2 w-fit text-sm font-medium underline underline-offset-4">
							Back to the shop
						</Link>
					</div>
				</div>
			</Container>
		</Section>
	);
}

function Timeline({ status }: { status: OrderStatus }) {
	const currentIndex = ORDER_TIMELINE.indexOf(status);

	return (
		<ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
			{ORDER_TIMELINE.map((step, index) => {
				const done = index <= currentIndex;
				return (
					<li
						key={step}
						className="flex items-center gap-2">
						<span
							className={cn(
								"rounded-pill px-3 py-1.5 text-xs font-medium",
								done ? "bg-cocoa text-paper" : "border-line text-cocoa-soft border",
							)}
							aria-current={index === currentIndex ? "step" : undefined}>
							{ORDER_STATUS_LABELS[step]}
						</span>
						{index < ORDER_TIMELINE.length - 1 ? (
							<span
								className="bg-line h-px w-4"
								aria-hidden="true"
							/>
						) : null}
					</li>
				);
			})}
		</ol>
	);
}

function Fulfilment({
	order,
	settings,
	privateSettings,
	showPrivate,
}: {
	order: Order;
	settings: SiteSettings;
	privateSettings: PrivateSettings;
	showPrivate: boolean;
}) {
	const rows: Array<{ label: string; value: string }> = [
		{
			label: order.fulfilment === "delivery" ? "Delivery date" : "Pickup date",
			value: formatDateLong(order.pickupDate),
		},
	];

	if (order.fulfilment === "delivery") {
		if (order.deliveryAddress) rows.push({ label: "Address", value: order.deliveryAddress });
	} else {
		if (settings.pickupWindowText) rows.push({ label: "Time", value: settings.pickupWindowText });
		if (showPrivate && privateSettings.pickupAddress) {
			rows.push({ label: "Address", value: privateSettings.pickupAddress });
		} else if (settings.pickupSuburb) {
			rows.push({ label: "Area", value: settings.pickupSuburb });
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<SectionLabel as="h2">{order.fulfilment === "delivery" ? "Delivery" : "Pickup"}</SectionLabel>
			<HairlineList as="dl">
				{rows.map((row) => (
					<HairlineRow
						key={row.label}
						as="div">
						<dt className="text-cocoa-soft text-sm">{row.label}</dt>
						<dd className="text-right text-sm font-medium">{row.value}</dd>
					</HairlineRow>
				))}
			</HairlineList>
			{order.fulfilment === "pickup" && showPrivate && settings.pickupInstructions ? (
				<p className="text-cocoa-soft text-sm">{settings.pickupInstructions}</p>
			) : null}
			{!showPrivate && order.fulfilment === "pickup" ? (
				<p className="text-cocoa-soft text-xs">
					We&rsquo;ll send the exact address once your order is confirmed.
				</p>
			) : null}
		</div>
	);
}

function Payment({ order, privateSettings }: { order: Order; privateSettings: PrivateSettings }) {
	return (
		<div className="border-line flex flex-col gap-3 rounded-lg border p-6">
			<SectionLabel as="h2">Payment</SectionLabel>
			<HairlineList as="dl">
				{privateSettings.bankAccountName ? (
					<HairlineRow as="div">
						<dt className="text-cocoa-soft text-sm">Account name</dt>
						<dd className="text-right text-sm font-medium">{privateSettings.bankAccountName}</dd>
					</HairlineRow>
				) : null}
				<HairlineRow as="div">
					<dt className="text-cocoa-soft text-sm">Account number</dt>
					<dd className="text-right">
						<CopyValue value={privateSettings.bankAccountNumber!} />
					</dd>
				</HairlineRow>
				<HairlineRow as="div">
					<dt className="text-cocoa-soft text-sm">Amount</dt>
					<dd className="text-right text-sm font-medium">{formatMoney(order.totalCents)}</dd>
				</HairlineRow>
				<HairlineRow as="div">
					<dt className="text-cocoa-soft text-sm">Reference</dt>
					<dd className="text-right">
						<CopyValue value={order.reference} />
					</dd>
				</HairlineRow>
			</HairlineList>
			<p className="text-cocoa-soft text-xs">
				Please use <strong className="font-medium">{order.reference}</strong> as the reference so we
				can match your payment.
			</p>
		</div>
	);
}
