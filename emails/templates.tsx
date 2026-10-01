import { Section, Text } from "@react-email/components";
import { formatDateLong, formatDateLongWithTime } from "@/lib/dates";
import { firstName } from "@/lib/names";
import { formatMoney, hasUnpricedWork } from "@/lib/pricing";
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

/** Where the customer can always look their order up. */
const statusUrl = (ctx: EmailContext) => `${ctx.siteUrl}/order/${ctx.order.token}`;

/** The form under the same token, which is the only way to reach it. */
const feedbackUrl = (ctx: EmailContext) => `${statusUrl(ctx)}/feedback`;

/**
 * The page that offers to stop these, which is not the same address as the one
 * in the `List-Unsubscribe` header.
 *
 * This one is a page with a button on it, and a GET of it changes nothing. That
 * matters: corporate link scanners open every URL in a message, and a visible
 * link that unsubscribed on sight would quietly mute customers who never
 * touched it. The header's address is a POST-only route, which no scanner
 * calls. See lib/unsubscribe.ts.
 */
/** The line under a customer email, where the shop has a contact address to give. */
const questionsNote = (settings: EmailContext["settings"]) =>
	settings.contactEmail
		? `Questions? Reply to this email or write to ${settings.contactEmail}.`
		: undefined;

const unsubscribeUrl = (ctx: EmailContext) => `${ctx.siteUrl}/unsubscribe/${ctx.order.token}`;

/**
 * True while the customer is still waiting to be told what this costs.
 *
 * Asked of the lines rather than of the total. A custom cake alongside $24 of
 * cupcakes leaves a total that is real, is not nothing, and is still missing
 * the cake — so "your total is $24, please don't pay it yet" would be two
 * wrong things in one sentence.
 */
function awaitingPrice(order: Order): boolean {
	// A quote above zero makes the total above zero, so a zero total is only
	// ever an unquoted one.
	return hasUnpricedWork(order.items, order.quoteCents) || order.totalCents === 0;
}

// ---------------------------------------------------------------------------
// To the owner, the moment an order lands.
// ---------------------------------------------------------------------------
function NewOrderOwnerEmail(ctx: EmailContext) {
	const { order } = ctx;

	return (
		<EmailLayout
			siteUrl={ctx.siteUrl}
			preview={`${order.reference}, ${formatDateLongWithTime(order.pickupDate, order.pickupTime)}, ${formatMoney(order.totalCents)}`}
			heading={`New order ${order.reference}`}
			footerNote="You're getting this because you're listed as the notification email in the admin settings.">
			<Paragraph>
				{order.customerName} has asked for{" "}
				{formatDateLongWithTime(order.pickupDate, order.pickupTime)}.
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
				quoteCents={order.quoteCents}
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
				paths={order.inspirationImagePaths}
				url={order.inspirationUrl}
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
			footerNote={questionsNote(settings)}>
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
				quoteCents={order.quoteCents}
				// Said here and nowhere else in the emails. The shop said it before
				// they ordered and the order page goes on saying it; the confirmation
				// does not, because by then she has decided what it costs.
				customFlavourNote="You've asked for a flavour of your own, which can cost a little more than the price on the menu. I'll let you know if it does, before I make a start."
			/>

			<DetailRows
				rows={[
					{ label: "Reference", value: order.reference },
					{
						label: order.fulfilment === "delivery" ? "Delivery date" : "Pickup date",
						value: formatDateLongWithTime(order.pickupDate, order.pickupTime),
					},
				]}
			/>

			{order.customRequest ? <CustomRequestBlock request={order.customRequest} /> : null}

			{/* Read back as well, for the same reason the words are: this is the
			    last chance anyone has to notice the wrong picture went up. */}
			<InspirationBlock
				paths={order.inspirationImagePaths}
				url={order.inspirationUrl}
				heading="Pictures you sent"
			/>

			<ActionLink href={statusUrl(ctx)}>Check your order</ActionLink>

			<Paragraph>
				{awaitingPrice(order)
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
			footerNote={questionsNote(settings)}>
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
				quoteCents={order.quoteCents}
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

// ---------------------------------------------------------------------------
// To the customer, a day after they collected. The only email here that asks
// for something rather than telling them something, which is why it is the
// shortest: one link, one sentence about what happens to the answer.
//
// It goes out once per order, from the nightly cron. See lib/feedback.ts.
// ---------------------------------------------------------------------------
function FeedbackRequestEmail(ctx: EmailContext) {
	const { order, settings } = ctx;

	return (
		<EmailLayout
			siteUrl={ctx.siteUrl}
			preview={`A quick word about ${order.reference}`}
			heading="How was it?"
			footerNote={questionsNote(settings)}
			unsubscribeUrl={unsubscribeUrl(ctx)}>
			<Paragraph>
				Hi {firstName(order.customerName)}, thank you for your order on{" "}
				{formatDateLong(order.pickupDate)}. I&rsquo;d love to know how it went.
			</Paragraph>

			{/* One line, and it earns its place by naming the stars: the form asks
			    for something the email did not mention for a while. It is a list of
			    what is on the form and not an explanation of it, deliberately. The
			    rules — that the tick box covers the words and not the marks, and
			    that a mark is only ever shown inside an average — are stated on the
			    form itself, next to the fields they govern, which is where somebody
			    deciding what to fill in will actually read them. Repeating them
			    here is what turned this into a paragraph nobody finished. */}
			<Paragraph>
				A few words, stars if you feel like it, and a tick box if I may quote you.
			</Paragraph>

			<ActionLink href={feedbackUrl(ctx)}>Tell me how it went</ActionLink>

			<Paragraph>
				If something wasn&rsquo;t right, tell me that too. Replying reaches me just the same.
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
	"feedback-request": FeedbackRequestEmail,
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
	// No reference in this one. Every other subject here is a receipt and reads
	// like one; this is her asking a favour, and it should look like it in a
	// crowded inbox.
	"feedback-request": ({ settings }) => `How was your ${settings.businessName} order?`,
};
