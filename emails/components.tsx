import {
	Body,
	Column,
	Container,
	Head,
	Hr,
	Html,
	Link,
	Preview,
	Row,
	Section,
	Text,
} from "@react-email/components";
import type { Order, OrderItem } from "@/lib/types";
import { formatMoney } from "@/lib/pricing";
import { formatDateLong } from "@/lib/dates";

/**
 * Shared chrome for every transactional email.
 *
 * Deliberately plain: a table-free single column, web-safe serif and sans
 * stacks, inline styles, no images beyond the wordmark as text. Email clients
 * mangle anything cleverer, and a bakery confirmation that renders as a wall of
 * broken boxes in Outlook is worse than one that renders as plain type
 * everywhere.
 */

const PAPER = "#FFF8EA";
const PAPER_DEEP = "#FEF2C5";
const COCOA = "#442910";
const COCOA_SOFT = "#6E4B32";
const LINE = "#E3D5C4";
const ROSE = "#F7CCD5";

const SERIF = 'Georgia, "Times New Roman", Times, serif';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const styles = { PAPER, PAPER_DEEP, COCOA, COCOA_SOFT, LINE, ROSE, SERIF, SANS };

export function EmailLayout({
	preview,
	heading,
	children,
	footerNote,
}: {
	preview: string;
	heading: string;
	children: React.ReactNode;
	footerNote?: string;
}) {
	return (
		<Html lang="en">
			<Head />
			<Preview>{preview}</Preview>
			<Body
				style={{
					backgroundColor: PAPER,
					color: COCOA,
					fontFamily: SANS,
					margin: 0,
					padding: "24px 0",
				}}>
				<Container
					style={{
						backgroundColor: PAPER,
						maxWidth: "560px",
						margin: "0 auto",
						padding: "8px 24px 32px",
					}}>
					<Text
						style={{
							fontFamily: SERIF,
							fontSize: "26px",
							fontWeight: 700,
							letterSpacing: "-0.02em",
							margin: "0 0 4px",
						}}>
						vvbakes
					</Text>
					<Text
						style={{
							fontFamily: SERIF,
							fontSize: "13px",
							fontStyle: "italic",
							color: COCOA_SOFT,
							margin: "0 0 28px",
						}}>
						inspired desserts
					</Text>

					<Text
						style={{
							fontFamily: SERIF,
							fontSize: "24px",
							lineHeight: 1.25,
							margin: "0 0 20px",
						}}>
						{heading}
					</Text>

					{children}

					<Hr style={{ borderColor: LINE, margin: "32px 0 16px" }} />
					<Text style={{ fontSize: "12px", color: COCOA_SOFT, margin: 0 }}>
						{footerNote ?? "Reply to this email if anything needs changing."}
					</Text>
				</Container>
			</Body>
		</Html>
	);
}

export function Paragraph({ children }: { children: React.ReactNode }) {
	return <Text style={{ fontSize: "15px", lineHeight: 1.6, margin: "0 0 14px" }}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
	return (
		<Text
			style={{
				fontSize: "11px",
				letterSpacing: "0.14em",
				textTransform: "uppercase",
				color: COCOA_SOFT,
				margin: "0 0 8px",
			}}>
			{children}
		</Text>
	);
}

/** A hairline key/value list, the same shape the site uses. */
export function DetailRows({ rows }: { rows: Array<{ label: string; value: string }> }) {
	return (
		<Section style={{ borderTop: `1px solid ${LINE}`, margin: "0 0 20px" }}>
			{rows.map((row) => (
				<Row
					key={row.label}
					style={{ borderBottom: `1px solid ${LINE}` }}>
					<Column style={{ padding: "10px 0", fontSize: "14px", color: COCOA_SOFT }}>
						{row.label}
					</Column>
					<Column
						style={{
							padding: "10px 0",
							fontSize: "14px",
							fontWeight: 600,
							textAlign: "right",
						}}>
						{row.value}
					</Column>
				</Row>
			))}
		</Section>
	);
}

export function OrderItemsTable({
	items,
	subtotalCents,
	deliveryFeeCents,
	totalCents,
}: {
	items: OrderItem[];
	subtotalCents: number;
	deliveryFeeCents: number;
	totalCents: number;
}) {
	return (
		<Section style={{ borderTop: `1px solid ${LINE}`, margin: "0 0 20px" }}>
			{items.map((item) => (
				<Row
					key={item.id}
					style={{ borderBottom: `1px solid ${LINE}` }}>
					<Column style={{ padding: "12px 0", verticalAlign: "top" }}>
						<Text style={{ fontSize: "15px", fontWeight: 600, margin: 0 }}>
							{item.qty} &times; {item.productName}
						</Text>
						{item.pricingNote ? (
							<Text style={{ fontSize: "12px", color: COCOA_SOFT, margin: "2px 0 0" }}>
								{item.pricingNote}
							</Text>
						) : null}
					</Column>
					<Column
						style={{
							padding: "12px 0",
							verticalAlign: "top",
							textAlign: "right",
							whiteSpace: "nowrap",
						}}>
						<Text style={{ fontSize: "15px", margin: 0 }}>{formatMoney(item.lineTotalCents)}</Text>
					</Column>
				</Row>
			))}

			{deliveryFeeCents > 0 ? (
				<>
					<Row style={{ borderBottom: `1px solid ${LINE}` }}>
						<Column style={{ padding: "10px 0", fontSize: "14px", color: COCOA_SOFT }}>
							Subtotal
						</Column>
						<Column style={{ padding: "10px 0", fontSize: "14px", textAlign: "right" }}>
							{formatMoney(subtotalCents)}
						</Column>
					</Row>
					<Row style={{ borderBottom: `1px solid ${LINE}` }}>
						<Column style={{ padding: "10px 0", fontSize: "14px", color: COCOA_SOFT }}>
							Delivery
						</Column>
						<Column style={{ padding: "10px 0", fontSize: "14px", textAlign: "right" }}>
							{formatMoney(deliveryFeeCents)}
						</Column>
					</Row>
				</>
			) : null}

			<Row>
				<Column style={{ padding: "14px 0", fontSize: "16px", fontWeight: 600 }}>Total</Column>
				<Column
					style={{
						padding: "14px 0",
						fontFamily: SERIF,
						fontSize: "20px",
						textAlign: "right",
					}}>
					{formatMoney(totalCents)}
				</Column>
			</Row>
		</Section>
	);
}

/** The pickup or delivery block, shared by the confirmed and ready emails. */
export function FulfilmentDetails({
	order,
	pickupAddress,
	pickupWindowText,
	pickupInstructions,
}: {
	order: Pick<Order, "fulfilment" | "pickupDate" | "deliveryAddress">;
	pickupAddress: string | null;
	pickupWindowText: string | null;
	pickupInstructions: string | null;
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
		if (pickupWindowText) rows.push({ label: "Time", value: pickupWindowText });
		if (pickupAddress) rows.push({ label: "Address", value: pickupAddress });
	}

	return (
		<>
			<Label>{order.fulfilment === "delivery" ? "Delivery" : "Pickup"}</Label>
			<DetailRows rows={rows} />
			{order.fulfilment === "pickup" && pickupInstructions ? (
				<Paragraph>{pickupInstructions}</Paragraph>
			) : null}
		</>
	);
}

export function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
	return (
		<Section style={{ margin: "0 0 20px" }}>
			<Link
				href={href}
				style={{
					backgroundColor: ROSE,
					color: COCOA,
					borderRadius: "999px",
					display: "inline-block",
					fontSize: "14px",
					fontWeight: 600,
					padding: "12px 24px",
					textDecoration: "none",
				}}>
				{children}
			</Link>
		</Section>
	);
}
