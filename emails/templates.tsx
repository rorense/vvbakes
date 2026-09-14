import { Section, Text } from "@react-email/components";
import { formatDateLong } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import type { Order, PrivateSettings, SiteSettings } from "@/lib/types";
import {
	ActionLink,
	CustomRequestBlock,
	DetailRows,
	EmailLayout,
	FulfilmentDetails,
	InspirationBlock,
	Label,
	OrderItemsTable,
	Paragraph,
	styles,
} from "./components";

export interface EmailContext {
	order: Order;
	settings: SiteSettings;
	privateSettings: PrivateSettings;
	siteUrl: string;
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

/** Where the customer can always look their order up. */
const statusUrl = (ctx: EmailContext) => `${ctx.siteUrl}/order/${ctx.order.token}`;

// ---------------------------------------------------------------------------
// To the owner, the moment an order lands.
// ---------------------------------------------------------------------------
function NewOrderOwnerEmail(ctx: EmailContext) {
	const { order } = ctx;

	return (
		<EmailLayout
			siteUrl={ctx.siteUrl}
			preview={`${order.reference}, ${formatDateLong(order.pickupDate)}, ${formatMoney(order.totalCents)}`}
			heading={`New order ${order.reference}`}
			footerNote="You're getting this because you're listed as the notification email in the admin settings.">
			<Paragraph>
				{order.customerName} has asked for {formatDateLong(order.pickupDate)}.
			</Paragraph>

			<Label>Customer</Label>
			<DetailRows
				rows={[
					{ label: "Name", value: order.customerName },
					{ label: "Email", value: order.customerEmail },
					{ label: "Phone", value: order.customerPhone },
					{
						label: "Fulfilment",
						value: order.fulfilment === "delivery" ? "Delivery" : "Pickup",
					},
					...(order.deliveryAddress ? [{ label: "Address", value: order.deliveryAddress }] : []),
				]}
			/>

			<Label>Order</Label>
			<OrderItemsTable
				items={order.items}
				subtotalCents={order.subtotalCents}
				deliveryFeeCents={order.deliveryFeeCents}
				totalCents={order.totalCents}
			/>

			{order.notes ? (
				<>
					<Label>Notes and allergies</Label>
					<Paragraph>{order.notes}</Paragraph>
				</>
			) : null}

			{order.customRequest ? (
				<>
					<Label>Custom request</Label>
					<Paragraph>{order.customRequest}</Paragraph>
				</>
			) : null}

			<InspirationBlock
				order={order}
				heading="Pictures they sent"
			/>

			<ActionLink href={`${ctx.siteUrl}/admin/orders/${order.id}`}>Open in the admin</ActionLink>

			<Paragraph>
				Nothing has been confirmed yet. The customer has been told to wait for your confirmation
				before paying.
			</Paragraph>
		</EmailLayout>
	);
}

// ---------------------------------------------------------------------------
// To the customer, acknowledging the request. No bank details: nothing has been
// agreed yet, and asking for money before confirming is how double bookings
// turn into refunds.
// ---------------------------------------------------------------------------
function OrderReceivedEmail(ctx: EmailContext) {
	const { order, settings } = ctx;

	return (
		<EmailLayout
			siteUrl={ctx.siteUrl}
			preview={`We've got your order request ${order.reference}`}
			heading="Thanks, I've got your order request"
			footerNote={
				settings.contactEmail
					? `Questions? Reply to this email or write to ${settings.contactEmail}.`
					: undefined
			}>
			<Paragraph>
				Hi {firstName(order.customerName)}, thank you. This is a request rather than a confirmation.
				I&rsquo;ll check the day and come back to you shortly.
			</Paragraph>

			<Label>Your order</Label>
			<OrderItemsTable
				items={order.items}
				subtotalCents={order.subtotalCents}
				deliveryFeeCents={order.deliveryFeeCents}
				totalCents={order.totalCents}
			/>

			<DetailRows
				rows={[
					{ label: "Reference", value: order.reference },
					{
						label: order.fulfilment === "delivery" ? "Delivery date" : "Pickup date",
						value: formatDateLong(order.pickupDate),
					},
				]}
			/>

			{order.customRequest ? <CustomRequestBlock request={order.customRequest} /> : null}

			{/* Read back as well, for the same reason the words are: this is the
			    last chance anyone has to notice the wrong picture went up. */}
			<InspirationBlock
				order={order}
				heading="Pictures you sent"
			/>

			<ActionLink href={statusUrl(ctx)}>Check your order</ActionLink>

			<Paragraph>
				{order.totalCents === 0
					? "I'll come back to you with a price and a date I can do, usually within a day. Nothing to pay until then."
					: "Please hold off on paying until you get the confirmation email."}
			</Paragraph>
		</EmailLayout>
	);
}

// ---------------------------------------------------------------------------
// To the customer, once the owner confirms. This is the only email that carries
// bank details and the full pickup address.
// ---------------------------------------------------------------------------
function OrderConfirmedEmail(ctx: EmailContext) {
	const { order, settings, privateSettings } = ctx;
	const hasBank = Boolean(privateSettings.bankAccountNumber);

	return (
		<EmailLayout
			siteUrl={ctx.siteUrl}
			preview={`Order ${order.reference} is confirmed`}
			heading="Your order is confirmed"
			footerNote={
				settings.contactEmail
					? `Questions? Reply to this email or write to ${settings.contactEmail}.`
					: undefined
			}>
			<Paragraph>
				Hi {firstName(order.customerName)}, you&rsquo;re all booked in for{" "}
				{formatDateLong(order.pickupDate)}.
			</Paragraph>

			<Label>Your order</Label>
			<OrderItemsTable
				items={order.items}
				subtotalCents={order.subtotalCents}
				deliveryFeeCents={order.deliveryFeeCents}
				totalCents={order.totalCents}
			/>

			{order.customRequest ? (
				<CustomRequestBlock
					request={order.customRequest}
					heading="The cake I'm making you"
				/>
			) : null}

			{hasBank ? (
				<Section
					style={{
						backgroundColor: styles.PAPER_DEEP,
						borderRadius: "12px",
						padding: "20px 20px 8px",
						margin: "0 0 20px",
					}}>
					<Label>Payment</Label>
					<DetailRows
						rows={[
							...(privateSettings.bankAccountName
								? [{ label: "Account name", value: privateSettings.bankAccountName }]
								: []),
							{ label: "Account number", value: privateSettings.bankAccountNumber! },
							{ label: "Amount", value: formatMoney(order.totalCents) },
							{ label: "Reference", value: order.reference },
						]}
					/>
					<Text style={{ fontSize: "13px", color: styles.COCOA_SOFT, margin: "0 0 12px" }}>
						Please use <strong>{order.reference}</strong> as the reference so I can match your
						payment.
					</Text>
				</Section>
			) : (
				<Paragraph>
					I&rsquo;ll send payment details separately. Reply here if you don&rsquo;t hear from me.
				</Paragraph>
			)}

			<FulfilmentDetails
				order={order}
				pickupAddress={privateSettings.pickupAddress}
				pickupWindowText={settings.pickupWindowText}
				pickupInstructions={settings.pickupInstructions}
			/>

			<ActionLink href={statusUrl(ctx)}>View your order</ActionLink>
		</EmailLayout>
	);
}

// ---------------------------------------------------------------------------
// To the customer, on the day.
// ---------------------------------------------------------------------------
function OrderReadyEmail(ctx: EmailContext) {
	const { order, settings, privateSettings } = ctx;

	return (
		<EmailLayout
			siteUrl={ctx.siteUrl}
			preview={`${order.reference} is ready`}
			heading={
				order.fulfilment === "delivery"
					? "Your order is ready to go"
					: "Your order is ready to collect"
			}>
			<Paragraph>
				Hi {firstName(order.customerName)}, {order.reference} is boxed up and waiting.
			</Paragraph>

			<FulfilmentDetails
				order={order}
				pickupAddress={privateSettings.pickupAddress}
				pickupWindowText={settings.pickupWindowText}
				pickupInstructions={settings.pickupInstructions}
			/>

			<Paragraph>
				Just reply to this email if you&rsquo;re running late or need to rearrange.
			</Paragraph>
		</EmailLayout>
	);
}

// ---------------------------------------------------------------------------
// To the customer, when an order is cancelled.
// ---------------------------------------------------------------------------
function OrderCancelledEmail(ctx: EmailContext) {
	const { order, settings } = ctx;

	return (
		<EmailLayout
			siteUrl={ctx.siteUrl}
			preview={`Order ${order.reference} has been cancelled`}
			heading="Your order has been cancelled">
			<Paragraph>
				Hi {firstName(order.customerName)}, we&rsquo;ve cancelled {order.reference}, which was
				booked for {formatDateLong(order.pickupDate)}.
			</Paragraph>

			{order.cancellationReason ? <Paragraph>{order.cancellationReason}</Paragraph> : null}

			<Paragraph>
				If you&rsquo;ve already paid, I&rsquo;ll refund you. Reply to this email and I&rsquo;ll sort
				it out.
				{settings.contactPhone ? ` You can also call ${settings.contactPhone}.` : ""}
			</Paragraph>
		</EmailLayout>
	);
}

export const TEMPLATES = {
	"new-order-owner": NewOrderOwnerEmail,
	"order-received": OrderReceivedEmail,
	"order-confirmed": OrderConfirmedEmail,
	"order-ready": OrderReadyEmail,
	"order-cancelled": OrderCancelledEmail,
} as const;

export type TemplateName = keyof typeof TEMPLATES;

export const SUBJECTS: Record<TemplateName, (ctx: EmailContext) => string> = {
	"new-order-owner": ({ order }) =>
		`New order ${order.reference}, ${formatDateLong(order.pickupDate)}, ${formatMoney(order.totalCents)}`,
	"order-received": ({ order }) => `We've got your order request (${order.reference})`,
	"order-confirmed": ({ order }) => `Order ${order.reference} confirmed, payment details inside`,
	"order-ready": ({ order }) =>
		order.fulfilment === "delivery"
			? `${order.reference} is ready for delivery`
			: `${order.reference} is ready to collect`,
	"order-cancelled": ({ order }) => `Order ${order.reference} has been cancelled`,
};
