/**
 * How a calendar day is painted and described.
 *
 * Two calendars show a customer the same days: the one on the home page, which
 * is a read-only view of when the bakery bakes, and the one in the order form,
 * which is how a pickup date is chosen. They have to agree. A second colour
 * table would drift the first time one of them was tweaked, and a day that
 * reads "fully booked" in one place and "not baking" in the other is worse than
 * either being wrong on its own.
 *
 * The wording matters more than usual here: "closed" and "too soon" are the
 * same blank square to someone scanning, and they mean very different things to
 * someone deciding whether to bother asking.
 */
import { MONDAY_FIRST } from "@/lib/dates";
import { WEEKDAY_NAMES, type PublicDayState } from "@/lib/types";

/** Single initials for a narrow grid, and the full name for a screen reader. */
export const CALENDAR_COLUMNS = MONDAY_FIRST.map((weekday) => ({
	weekday,
	initial: WEEKDAY_NAMES[weekday].slice(0, 1),
	name: WEEKDAY_NAMES[weekday],
}));

export const DAY_STATE: Record<PublicDayState, { className: string; label: string }> = {
	available: {
		className: "bg-mint/70 text-cocoa hover:bg-mint font-medium",
		label: "available",
	},
	full: {
		className: "bg-peach/60 text-cocoa-soft line-through decoration-1",
		label: "fully booked",
	},
	"too-soon": {
		className: "bg-paper-deep text-cocoa-soft/70",
		label: "too soon to order",
	},
	closed: {
		className: "text-cocoa-soft/35",
		label: "not baking",
	},
	past: {
		className: "text-cocoa-soft/25",
		label: "in the past",
	},
	"not-yet-open": {
		className: "text-cocoa-soft/35",
		label: "not open for orders yet",
	},
};

/** The states worth explaining under the grid. The rest are self-evident. */
export const LEGEND_STATES: readonly PublicDayState[] = ["available", "full", "too-soon"];

export const LEGEND_COPY: Partial<Record<PublicDayState, string>> = {
	available: "Open for orders",
	full: "Fully booked",
	"too-soon": "Not enough notice",
};
