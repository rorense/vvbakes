import {
	Body,
	Column,
	Container,
	Head,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Row,
	Section,
	Text,
} from "@react-email/components";
import type { Order, OrderItem } from "@/lib/types";
import { frostingLabel } from "@/lib/brief";
import { inspirationImageUrl } from "@/lib/images";
import {
	couldCostMore,
	extraLabel,
	formatMoney,
	hasUnpricedWork,
	lineTotalWithExtras,
} from "@/lib/pricing";
import { formatDateLongWithTime } from "@/lib/dates";
import { isHttpUrl } from "@/lib/validation";

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
	siteUrl,
	preview,
	heading,
	children,
	footerNote,
}: {
	siteUrl: string;
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
					{/*
					 * Decorative: the wordmark underneath is the accessible name, so a
					 * client that blocks remote images loses nothing but the picture.
					 */}
					<Img
						src={`${siteUrl}/email-logo.png`}
						width="72"
						height="72"
						alt=""
						style={{ display: "block", margin: "0 0 12px" }}
					/>

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

/**
 * A labelled answer under a line: the flavour, the frosting.
 *
 * Its own constant rather than repeated inline, because two answers styled
 * almost the same is how a mail template starts drifting — and these two are
 * read together, standing at a bench.
 */
const BRIEF_ANSWER = {
	fontSize: "13px",
	fontWeight: 600,
	margin: "6px 0 0",
} as const;

export function OrderItemsTable({
	items,
	subtotalCents,
	deliveryFeeCents,
	totalCents,
	quoteCents,
	unpricedNote,
	customFlavourNote,
}: {
	items: OrderItem[];
	subtotalCents: number;
	deliveryFeeCents: number;
	totalCents: number;
	/** What the owner has quoted for the custom work. Zero means not priced yet. */
	quoteCents: number;
	/** The line under the total when the order holds priced items and custom work both. */
	unpricedNote?: string;
	/**
	 * The line under the total when something was asked for in a flavour of its
	 * own, where the figure above is a real price she is nonetheless allowed to
	 * add to. Only the "I've got your request" email passes it: by the time she
	 * confirms, she has decided, and the total is the total.
	 */
	customFlavourNote?: string;
}) {
	// Shared with the on-screen table in components/order/OrderLines.tsx, which
	// has to answer both of these identically. See the note in lib/pricing.ts.
	const hasUnpriced = hasUnpricedWork(items, quoteCents);
	const mayCostMore = couldCostMore(items, quoteCents);

	return (
		<Section style={{ borderTop: `1px solid ${LINE}`, margin: "0 0 20px" }}>
			{items.length === 0 ? (
				<Row style={{ borderBottom: `1px solid ${LINE}` }}>
					<Column style={{ padding: "12px 0" }}>
						<Text style={{ fontSize: "15px", fontWeight: 600, margin: 0 }}>One custom cake</Text>
						<Text style={{ fontSize: "12px", color: COCOA_SOFT, margin: "2px 0 0" }}>
							Made to your description
						</Text>
					</Column>
				</Row>
			) : null}
			{items.map((item) => {
				const frosting = frostingLabel(item.frosting, item.frostingMatchesFlavour);

				return (
					<Row
						key={item.id}
						style={{ borderBottom: `1px solid ${LINE}` }}>
						<Column style={{ padding: "12px 0", verticalAlign: "top" }}>
							<Text style={{ fontSize: "15px", fontWeight: 600, margin: 0 }}>
								{item.qty} &times; {item.productName}
							</Text>
							{item.variantName ? (
								<Text style={{ fontSize: "12px", color: COCOA_SOFT, margin: "2px 0 0" }}>
									{item.variantName}
								</Text>
							) : null}
							{item.pricingNote ? (
								<Text style={{ fontSize: "12px", color: COCOA_SOFT, margin: "2px 0 0" }}>
									{item.pricingNote}
								</Text>
							) : null}
							{/* Named under the line, not folded into the price beside it: that
						    price is what the menu charged, and the extras are counted into
						    the total at the bottom. She has to be able to read this and
						    know to put candles in the box. */}
							{item.extras.map((extra) => (
								<Text
									key={extra.id}
									style={{ fontSize: "12px", color: COCOA_SOFT, margin: "2px 0 0" }}>
									+ {extraLabel(extra.name, extra.unitQty)}{" "}
									{extra.lineTotalCents === 0 ? "(free)" : formatMoney(extra.lineTotalCents)}
								</Text>
							))}

							{/* What they asked for, against the line they asked it of. This
						    is the whole brief for a custom cake, so it sits in the order
						    itself rather than in a block underneath — she reads this
						    email standing in the kitchen.

						    The flavour and the frosting are labelled and the note is not,
						    because they are answers to questions and are short enough to
						    be mistaken for each other: "pandan" alone could as easily be
						    either one. */}
							{item.customFlavour ? (
								<Text style={BRIEF_ANSWER}>Flavour: {item.customFlavour}</Text>
							) : null}
							{frosting ? <Text style={BRIEF_ANSWER}>Frosting: {frosting}</Text> : null}
							{item.note ? (
								<Text
									style={{
										fontSize: "14px",
										margin: "8px 0 0",
										paddingLeft: "10px",
										borderLeft: `2px solid ${LINE}`,
										whiteSpace: "pre-wrap",
									}}>
									{item.note}
								</Text>
							) : null}
							{item.inspirationImagePaths.length > 0 || item.inspirationUrl ? (
								<Section style={{ margin: "8px 0 0" }}>
									<InspirationBlock
										paths={item.inspirationImagePaths}
										url={item.inspirationUrl}
									/>
								</Section>
							) : null}
						</Column>
						<Column
							style={{
								padding: "12px 0",
								verticalAlign: "top",
								textAlign: "right",
								whiteSpace: "nowrap",
							}}>
							<Text style={{ fontSize: "15px", margin: 0 }}>
								{/* A line nobody has priced yet is a dash, not a zero. Beside
							    a custom cake "$0.00" reads as one she is giving away. */}
								{item.priceOnRequest && lineTotalWithExtras(item) === 0
									? "—"
									: formatMoney(lineTotalWithExtras(item))}
							</Text>
						</Column>
					</Row>
				);
			})}

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
				{/* "So far" rather than "Total" while something on the order still has
				    no price on it: a total that is not the whole total is the one
				    number this shop cannot let anybody misread. */}
				<Column style={{ padding: "14px 0", fontSize: "16px", fontWeight: 600 }}>
					{hasUnpriced && totalCents > 0 ? "So far" : "Total"}
				</Column>
				<Column
					style={{
						padding: "14px 0",
						fontFamily: SERIF,
						fontSize: totalCents === 0 ? "15px" : "20px",
						textAlign: "right",
					}}>
					{/* A custom cake has no price until the baker sets one. Showing
					    $0.00 would be worse than showing nothing. */}
					{totalCents === 0 ? "To be confirmed" : formatMoney(totalCents)}
				</Column>
			</Row>

			{hasUnpriced && totalCents > 0 ? (
				<Row>
					<Column style={{ padding: "0 0 12px", fontSize: "12px", color: COCOA_SOFT }}>
						{unpricedNote ?? "Plus whatever the custom work comes to, once it is priced."}
					</Column>
				</Row>
			) : null}

			{mayCostMore && customFlavourNote ? (
				<Row>
					<Column style={{ padding: "0 0 12px", fontSize: "12px", color: COCOA_SOFT }}>
						{customFlavourNote}
					</Column>
				</Row>
			) : null}
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
	order: Pick<Order, "fulfilment" | "pickupDate" | "pickupTime" | "deliveryAddress">;
	pickupAddress: string | null;
	pickupWindowText: string | null;
	pickupInstructions: string | null;
}) {
	const rows: Array<{ label: string; value: string }> = [
		{
			label: order.fulfilment === "delivery" ? "Delivery date" : "Pickup date",
			value: formatDateLongWithTime(order.pickupDate, order.pickupTime),
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

/**
 * The pictures that came with the request.
 *
 * Every photo is also a link to itself, because plenty of clients block remote
 * images by default and a row of broken boxes with nothing to click would lose
 * the brief entirely. The customer's link is scheme-checked first, exactly as
 * it is on the pages: an email is the last place to put an unchecked href.
 */
export function InspirationBlock({
	paths,
	url,
	heading,
}: {
	paths: string[];
	url: string | null;
	/** Left out to render the pictures bare, under the line they belong to. */
	heading?: string;
}) {
	const images = paths
		.map((path) => inspirationImageUrl(path))
		.filter((one): one is string => one !== null);

	const link = url && isHttpUrl(url) ? url : null;

	if (images.length === 0 && !link) return null;

	return (
		<>
			{heading ? <Label>{heading}</Label> : null}
			<Section style={{ margin: "0 0 20px" }}>
				{images.map((src, index) => (
					<Link
						key={src}
						href={src}
						style={{ display: "inline-block", marginRight: "8px", marginBottom: "8px" }}>
						<Img
							src={src}
							alt={`Inspiration photo ${index + 1}`}
							width="150"
							style={{ border: `1px solid ${LINE}`, borderRadius: "8px" }}
						/>
					</Link>
				))}
				{link ? (
					<Text style={{ fontSize: "14px", margin: images.length > 0 ? "6px 0 0" : 0 }}>
						<Link
							href={link}
							style={{ color: COCOA, wordBreak: "break-all" }}>
							{link}
						</Link>
					</Text>
				) : null}
			</Section>
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

/**
 * The customer's own words, read back to them.
 *
 * For a custom cake this is the agreement. If a name was misspelled or "not too
 * sweet" was missed, this is the only chance anyone has to notice before it is
 * baked, so it goes in the acknowledgement and again in the confirmation.
 */
export function CustomRequestBlock({
	request,
	heading = "What you asked for",
}: {
	request: string;
	heading?: string;
}) {
	return (
		<Section
			style={{
				backgroundColor: PAPER_DEEP,
				borderRadius: "12px",
				padding: "18px 20px",
				margin: "0 0 20px",
			}}>
			<Label>{heading}</Label>
			<Text
				style={{
					fontSize: "15px",
					lineHeight: 1.6,
					margin: 0,
					whiteSpace: "pre-wrap",
				}}>
				{request}
			</Text>
		</Section>
	);
}
