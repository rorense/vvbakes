import { formatMoney } from "@/lib/pricing";
import type { Order } from "@/lib/types";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";

/**
 * What was ordered and what it comes to.
 *
 * Rendered twice from one place: on the customer's own order page and in the
 * admin. The two used to keep their own copy of it, which meant the price the
 * customer reads and the price the owner reads were free to drift apart on the
 * next tweak to either. That is the one disagreement this shop cannot afford,
 * so the rows are written once and the differences are passed in.
 *
 * The emails keep their own version in emails/components.tsx, and should: that
 * is a table of nested tds and inline styles because mail clients give you
 * nothing else, and pretending it is the same component as this would make both
 * of them worse.
 */
export function OrderLines({
	order,
	unpricedLabel,
	showQuote = false,
	emptyRow,
	className,
}: {
	order: Pick<Order, "items" | "deliveryFeeCents" | "quoteCents" | "totalCents">;
	/**
	 * What the total reads as before a custom cake has been priced. The customer
	 * is told what happens next; the owner is told what she still has to do.
	 */
	unpricedLabel: string;
	/**
	 * Break the owner's quote out as its own row. Only the admin shows it: to the
	 * customer the cake is a price, not a price plus a markup.
	 */
	showQuote?: boolean;
	/** Stands in for the menu lines when an order is a custom cake and nothing else. */
	emptyRow?: React.ReactNode;
	className?: string;
}) {
	return (
		<HairlineList className={className}>
			{order.items.length === 0 ? emptyRow : null}

			{order.items.map((item) => (
				<HairlineRow
					key={item.id}
					align="start">
					<div className="flex flex-col gap-0.5">
						<span className="font-medium">
							{item.qty} &times; {item.productName}
						</span>
						{item.variantName ? (
							<span className="text-cocoa-soft text-xs">{item.variantName}</span>
						) : null}
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

			{showQuote && order.quoteCents > 0 ? (
				<HairlineRow>
					<span className="text-cocoa-soft text-sm">Your price for the cake</span>
					<span className="shrink-0 text-sm">{formatMoney(order.quoteCents)}</span>
				</HairlineRow>
			) : null}

			<HairlineRow>
				<span className="font-medium">Total</span>
				{/* An unpriced total is a sentence, not a number, so it drops to body
				    size rather than sitting there in display type saying nothing. */}
				<span
					className={
						order.totalCents === 0
							? "text-cocoa-soft shrink-0 text-sm"
							: "font-display shrink-0 text-2xl"
					}>
					{order.totalCents === 0 ? unpricedLabel : formatMoney(order.totalCents)}
				</span>
			</HairlineRow>
		</HairlineList>
	);
}
