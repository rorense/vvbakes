/**
 * Which pickup dates a customer may choose.
 *
 * Mirrors the checks inside `place_order` (see the functions migration). As with
 * pricing, this is for display only — the database re-derives all of it under an
 * advisory lock when the order is written, so a stale page can never oversell a
 * day. When the two disagree the customer sees a date vanish with a message
 * rather than an order being taken that cannot be baked.
 */
import {
	addDays,
	compareDates,
	compareTimes,
	eachDay,
	localTimeIn,
	todayIn,
	weekdayOf,
	type IsoDate,
} from "./dates";
import type {
	AvailabilityOverride,
	AvailabilityRule,
	AvailabilityWindow,
	CalendarDay,
	DayState,
	PickableDate,
	SiteSettings,
	Weekday,
} from "./types";

export interface AvailabilityInput {
	settings: Pick<
		SiteSettings,
		| "ordersOpen"
		| "ordersClosedMessage"
		| "leadTimeDays"
		| "cutoffTime"
		| "bookingWindowDays"
		| "timezone"
	>;
	rules: AvailabilityRule[];
	overrides: AvailabilityOverride[];
	/** Active (non-cancelled) order count per pickup date. */
	counts: Record<IsoDate, number>;
	now?: Date;
}

function indexRules(rules: AvailabilityRule[]): Map<Weekday, AvailabilityRule> {
	return new Map(rules.map((rule) => [rule.weekday, rule]));
}

function indexOverrides(overrides: AvailabilityOverride[]): Map<IsoDate, AvailabilityOverride> {
	return new Map(overrides.map((override) => [override.date, override]));
}

/**
 * The earliest date a customer can pick, given lead time and the daily cut-off.
 *
 * With a two-day lead time and an 8pm cut-off, ordering at 7pm on Tuesday puts
 * the earliest pickup on Thursday; ordering at 9pm the same evening pushes it to
 * Friday, because Tuesday's baking slot has already been planned.
 */
export function earliestPickupDate(
	settings: Pick<SiteSettings, "leadTimeDays" | "cutoffTime" | "timezone">,
	now: Date = new Date(),
): IsoDate {
	const today = todayIn(settings.timezone, now);
	const pastCutoff = compareTimes(localTimeIn(settings.timezone, now), settings.cutoffTime) > 0;
	return addDays(today, settings.leadTimeDays + (pastCutoff ? 1 : 0));
}

/** Every date the customer may actually book, with how many slots are left. */
export function computeAvailability(input: AvailabilityInput): AvailabilityWindow {
	const { settings, rules, overrides, counts } = input;
	const now = input.now ?? new Date();

	if (!settings.ordersOpen) {
		return {
			ordersOpen: false,
			closedMessage: settings.ordersClosedMessage,
			earliest: null,
			latest: null,
			dates: [],
		};
	}

	const today = todayIn(settings.timezone, now);
	const earliest = earliestPickupDate(settings, now);
	const latest = addDays(today, settings.bookingWindowDays);

	// A lead time longer than the booking window would leave nothing to show.
	if (compareDates(earliest, latest) > 0) {
		return {
			ordersOpen: true,
			closedMessage: null,
			earliest,
			latest,
			dates: [],
		};
	}

	const rulesByWeekday = indexRules(rules);
	const overridesByDate = indexOverrides(overrides);
	const dates: PickableDate[] = [];

	for (const date of eachDay(earliest, latest)) {
		const rule = rulesByWeekday.get(weekdayOf(date));
		const override = overridesByDate.get(date);

		const isOpen = override ? override.isOpen : (rule?.isOpen ?? false);
		if (!isOpen) continue;

		const capacity = override?.capacity ?? rule?.capacity ?? 0;
		const remaining = capacity - (counts[date] ?? 0);
		if (remaining <= 0) continue;

		dates.push({ date, remaining, note: override?.note ?? null });
	}

	return { ordersOpen: true, closedMessage: null, earliest, latest, dates };
}

/** The next date anyone could pick up, for the home page's "next pickup" line. */
export function nextPickupDate(input: AvailabilityInput): PickableDate | null {
	return computeAvailability(input).dates[0] ?? null;
}

/**
 * Builds a month grid for the admin calendar, Monday-first, padded out with the
 * neighbouring months' days so the grid is always complete rectangles.
 *
 * Unlike `computeAvailability` this ignores lead time and the booking window:
 * the owner is managing her own schedule, not placing an order, and needs to see
 * and edit every day of the month including ones no customer could still book.
 */
export function buildCalendarMonth(options: {
	/** Any date inside the month to render. */
	month: IsoDate;
	rules: AvailabilityRule[];
	overrides: AvailabilityOverride[];
	counts: Record<IsoDate, number>;
	timezone: string;
	now?: Date;
}): CalendarDay[] {
	const { month, rules, overrides, counts, timezone } = options;
	const today = todayIn(timezone, options.now ?? new Date());

	const first: IsoDate = `${month.slice(0, 7)}-01`;
	const firstWeekday = weekdayOf(first);
	// Monday-first grid: Monday is 1, so Sunday needs six days of padding.
	const leading = firstWeekday === 0 ? 6 : firstWeekday - 1;
	const gridStart = addDays(first, -leading);

	const rulesByWeekday = indexRules(rules);
	const overridesByDate = indexOverrides(overrides);
	const monthPrefix = month.slice(0, 7);

	// Six rows always, so the grid does not jump height between months.
	return eachDay(gridStart, addDays(gridStart, 41)).map((date) => {
		const weekday = weekdayOf(date);
		const rule = rulesByWeekday.get(weekday);
		const override = overridesByDate.get(date);
		const isOpen = override ? override.isOpen : (rule?.isOpen ?? false);
		const capacity = override?.capacity ?? rule?.capacity ?? 0;
		const orderCount = counts[date] ?? 0;

		let state: DayState;
		if (compareDates(date, today) < 0) {
			state = "past";
		} else if (override && !override.isOpen) {
			state = "blocked";
		} else if (!isOpen) {
			state = "closed";
		} else if (orderCount >= capacity) {
			state = "full";
		} else {
			state = "open";
		}

		return {
			date,
			weekday,
			inMonth: date.startsWith(monthPrefix),
			state,
			capacity,
			orderCount,
			note: override?.note ?? null,
			hasOverride: override !== undefined,
		};
	});
}

/** Turns the rows from `order_counts_between` into a lookup. */
export function countsFromRows(
	rows: Array<{ pickup_date: string; order_count: number }>,
): Record<IsoDate, number> {
	const counts: Record<IsoDate, number> = {};
	for (const row of rows) {
		counts[row.pickup_date] = Number(row.order_count);
	}
	return counts;
}

/**
 * Turns an exception name raised by `place_order` into something a customer can
 * act on. Anything unrecognised falls back to a neutral message rather than
 * leaking a Postgres error.
 */
export function orderErrorMessage(raw: string): string {
	const known: Record<string, string> = {
		ORDERS_CLOSED: "We've paused new orders for now. Please check back soon.",
		EMPTY_ORDER: "Your order is empty. Add something from the shop first.",
		RATE_LIMITED: "That's a few orders in a row. Please wait a few minutes and try again.",
		DATE_NOT_BOOKABLE: "That pickup date is no longer available. Please choose another.",
		DATE_CLOSED: "We're not baking on that date. Please choose another.",
		DATE_FULL: "That date just filled up. Please choose another.",
		DELIVERY_DISABLED: "Delivery isn't available at the moment. Please choose pickup.",
		DELIVERY_ADDRESS_REQUIRED: "Please add a delivery address.",
		PRODUCT_UNAVAILABLE: "Something in your order has just sold out. Please review your order.",
		QTY_INVALID: "One of the quantities isn't available. Please review your order.",
		PRODUCT_NOT_FOUND: "Something in your order is no longer on the menu. Please review it.",
		SETTINGS_MISSING: "Something went wrong on our end. Please try again shortly.",
	};

	for (const [code, message] of Object.entries(known)) {
		if (raw.includes(code)) return message;
	}
	return "Something went wrong sending your order. Please try again.";
}
