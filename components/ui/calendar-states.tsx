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
 *
 * Fully booked is red rather than peach because peach is an accent used all
 * over the site for things that are perfectly fine, and a day you cannot have
 * should not look like one of them.
 */
import { cn } from "@/lib/cn";
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
		className: "bg-cherry/70 text-cocoa-soft line-through decoration-1",
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

/**
 * The key under a calendar grid.
 *
 * Both calendars carried an identical copy of this, which is the one thing the
 * file above exists to stop: a swatch is only useful if it is the same colour
 * as the day it is explaining, and two copies are two things to keep in step
 * with DAY_STATE rather than one.
 */
export function CalendarLegend() {
	return (
		<ul className="flex flex-wrap gap-x-5 gap-y-2">
			{LEGEND_STATES.map((state) => (
				<li
					key={state}
					className="text-cocoa-soft flex items-center gap-2 text-xs">
					<span
						className={cn("size-3.5 shrink-0 rounded-sm", DAY_STATE[state].className)}
						aria-hidden="true"
					/>
					{LEGEND_COPY[state]}
				</li>
			))}
		</ul>
	);
}
