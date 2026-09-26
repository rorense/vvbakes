import { formatMoney } from "@/lib/pricing";

/**
 * The total as a phone's bottom bar shows it: the figure, and the shortest true
 * caveat beside it.
 *
 * Two bars carry it, the order form's and the one at the foot of every other
 * page, and they describe the same basket, so they say the same words about it.
 * The desktop summary says all of this in sentences; there is no room for one
 * down here.
 */
export function BarTotal({
	totalCents,
	hasUnpriced,
	mayCostMore,
}: {
	totalCents: number;
	/** Something in the basket has no price yet. */
	hasUnpriced: boolean;
	/** Something in it was asked for in a flavour of its own. */
	mayCostMore: boolean;
}) {
	return (
		<span className="flex flex-wrap items-baseline gap-x-2">
			{totalCents > 0 ? (
				<span className="font-display text-xl">{formatMoney(totalCents)}</span>
			) : null}
			{/* A cake with no price at all is the bigger caveat of the two, so it
			    wins when a basket somehow holds both. */}
			{hasUnpriced ? (
				<span className="text-cocoa-soft text-xs">
					{totalCents > 0 ? "+ your cake" : "Price to follow"}
				</span>
			) : mayCostMore ? (
				<span className="text-cocoa-soft text-xs">may change</span>
			) : null}
		</span>
	);
}
