import type { OrderStatus } from "./types";

/**
 * Which status can follow which.
 *
 * Statuses only move forwards, except that anything still live can be cancelled.
 * A collected order cannot be un-collected: if something needs undoing, the
 * owner should say so rather than have the trail quietly rewritten.
 *
 * This lives outside the server action file because "use server" modules may
 * only export async functions.
 */
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
	new: ["confirmed", "cancelled"],
	confirmed: ["ready", "cancelled"],
	ready: ["collected", "cancelled"],
	collected: [],
	cancelled: [],
};

/**
 * Whether the order is with its customer, so asking how it was makes sense. The
 * feedback page and the action behind its form both ask this.
 */
export function canLeaveFeedback(status: OrderStatus): boolean {
	return status === "collected" || status === "ready";
}

/** Still needing her attention: anything that can yet move on. */
export const OPEN_STATUSES: OrderStatus[] = ["new", "confirmed", "ready"];

export function allowedTransitions(status: OrderStatus): OrderStatus[] {
	return NEXT_STATUSES[status];
}

/** The button label for moving an order into a given status. */
export const TRANSITION_LABELS: Record<OrderStatus, string> = {
	new: "Reopen",
	confirmed: "Confirm order",
	ready: "Mark ready",
	collected: "Mark collected",
	cancelled: "Cancel order",
};

/** What the customer is told when an order reaches this status. */
export const TRANSITION_EFFECTS: Partial<Record<OrderStatus, string>> = {
	confirmed: "Emails the customer with bank details, the reference and the pickup address.",
	ready: "Emails the customer to say it's ready to collect.",
	cancelled: "Emails the customer to say the order is cancelled.",
	// Not "no email is sent" any more, and this button is what starts the clock:
	// the nightly job asks this customer how it went the morning after it is
	// pressed. Said here because this is the only place she finds out, and
	// because an order she never closes is an order nobody is ever asked about.
	// See lib/feedback.ts.
	collected: "Closes the order. Tomorrow morning they're emailed asking how it went.",
};

export const STATUS_TONES: Record<OrderStatus, string> = {
	new: "bg-peach text-cocoa",
	confirmed: "bg-mint text-cocoa",
	ready: "bg-rose text-cocoa",
	collected: "bg-paper-deep text-cocoa-soft",
	cancelled: "bg-danger-tint text-danger",
};
