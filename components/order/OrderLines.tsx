import { frostingLabel, hasCustomFlavour } from "@/lib/brief";
import { formatMoney } from "@/lib/pricing";
import type { Order } from "@/lib/types";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { Inspiration } from "./Inspiration";

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
/**
 * What one line came to in total: the menu price plus everything added to it.
 *
 * The two are stored apart — `lineTotalCents` is what `pricingNote` explains,
 * and an extra is its own snapshotted row — so the sum is made here rather than
 * baked into either. The database adds them the same way when it writes the
 * order's subtotal, so the column on the right of each line and the total at the
 * bottom agree.
 */
function lineWithExtras(item: Order["items"][number]): number {
	return item.extras.reduce((total, extra) => total + extra.lineTotalCents, item.lineTotalCents);
}

export function OrderLines({
	order,
	unpricedLabel,
	unpricedNote,
	customFlavourNote,
	showQuote = false,
	emptyRow,
	tile,
	className,
}: {
	order: Pick<Order, "items" | "deliveryFeeCents" | "quoteCents" | "totalCents">;
	/**
	 * What the total reads as before a custom cake has been priced. The customer
	 * is told what happens next; the owner is told what she still has to do.
	 */
	unpricedLabel: string;
	/**
	 * The line under the total when an order holds both priced items and custom
	 * work, where the figure above is real but is not the whole story. Left out
	 * when there is nothing unpriced, and unnecessary when there is nothing
	 * *but*: `unpricedLabel` covers that on its own.
	 */
	unpricedNote?: React.ReactNode;
	/**
	 * The line under the total when something was asked for in a flavour of its
	 * own. Unlike a custom cake the figure above is a real, complete price — it
	 * is just one the owner is allowed to add to once she has read what is being
	 * asked, and the shop said so before it was ordered.
	 *
	 * Left out in the admin, where she is the one who would be adding to it.
	 */
	customFlavourNote?: React.ReactNode;
	/**
	 * Break the owner's quote out as its own row. Only the admin shows it: to the
	 * customer the cake is a price, not a price plus a markup.
	 */
	showQuote?: boolean;
	/** Stands in for the menu lines when an order somehow has none. */
	emptyRow?: React.ReactNode;
	/** How big the inspiration photos are. Bigger in the admin, where she works from them. */
	tile?: "sm" | "lg";
	className?: string;
}) {
	// Something on this order has no price on it, and no quote has been set
	// against it yet. Once she quotes, the total is the whole total again and
	// none of this needs saying.
	const hasUnpriced = order.items.some((item) => item.priceOnRequest) && order.quoteCents === 0;
	// Something here was asked for in a flavour of its own, and she has not
	// decided yet whether that costs more. Once she has, the total is the whole
	// total and none of this needs saying — the same rule the unpriced note
	// follows, for the same reason.
	const mayCostMore = order.items.some(hasCustomFlavour) && order.quoteCents === 0;

	return (
		<div className={className}>
			<HairlineList>
				{order.items.length === 0 ? emptyRow : null}

				{order.items.map((item) => {
					const money = lineWithExtras(item);
					// Unpriced *and* nothing added to it, so there is no honest number
					// to put here. A cake with candles on it still shows what the
					// candles came to.
					const silent = item.priceOnRequest && money === 0;
					const frosting = frostingLabel(item.frosting, item.frostingMatchesFlavour);

					return (
						<HairlineRow
							key={item.id}
							align="start">
							<div className="flex min-w-0 flex-col gap-0.5">
								<span className="font-medium">
									{item.qty} &times; {item.productName}
								</span>
								{item.variantName ? (
									<span className="text-cocoa-soft text-xs">{item.variantName}</span>
								) : null}
								{item.pricingNote ? (
									<span className="text-cocoa-soft text-xs">{item.pricingNote}</span>
								) : null}
								{/* The extras this line carried, each with what it came to. They
								    are not part of `lineTotalCents`, which is what the menu
								    charged and what `pricingNote` explains, so they are named
								    here and counted into the total below. */}
								{item.extras.map((extra) => (
									<span
										key={extra.id}
										className="text-cocoa-soft text-xs">
										+ {extra.name}{" "}
										{extra.lineTotalCents === 0 ? "(free)" : formatMoney(extra.lineTotalCents)}
									</span>
								))}

								{/* What the customer said about this one, under the line it
								    describes rather than gathered into a panel at the bottom
								    of the order. A brief belongs to its cake; an order with
								    two of them had nowhere to put the second. */}
								{item.note ||
								item.customFlavour ||
								frosting ||
								item.inspirationUrl ||
								item.inspirationImagePaths.length > 0 ? (
									<div className="border-line mt-2 flex flex-col gap-2 border-l pl-3">
										{/* Labelled, unlike the note, because these are answers to
										    questions and are short enough to be mistaken for each
										    other: "pandan" alone could as easily be the frosting.
										    She bakes from this. */}
										{item.customFlavour ? (
											<span className="text-cocoa-soft text-sm">Flavour: {item.customFlavour}</span>
										) : null}
										{frosting ? (
											<span className="text-cocoa-soft text-sm">Frosting: {frosting}</span>
										) : null}
										{item.note ? (
											<span className="text-cocoa-soft text-sm whitespace-pre-wrap">
												{item.note}
											</span>
										) : null}
										<Inspiration
											paths={item.inspirationImagePaths}
											url={item.inspirationUrl}
											tile={tile}
										/>
									</div>
								) : null}
							</div>

							{/* A line nobody has priced yet is a dash, not a zero: "$0.00"
							    beside a custom cake reads as one she is giving away. */}
							<span className={silent ? "text-cocoa-soft shrink-0 text-sm" : "shrink-0"}>
								{silent ? "—" : formatMoney(money)}
							</span>
						</HairlineRow>
					);
				})}

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
					{/* "So far" rather than "Total" while something on the order still
					    has no price: a total that is not the whole total is the one
					    number this shop cannot let anybody misread. */}
					<span className="font-medium">
						{hasUnpriced && order.totalCents > 0 ? "So far" : "Total"}
					</span>
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

			{hasUnpriced && order.totalCents > 0 && unpricedNote ? (
				<p className="text-cocoa-soft mt-2 text-xs">{unpricedNote}</p>
			) : null}

			{mayCostMore && customFlavourNote ? (
				<p className="text-cocoa-soft mt-2 text-xs">{customFlavourNote}</p>
			) : null}
		</div>
	);
}
