/**
 * Which pickup dates a customer may choose.
 *
 * Mirrors the checks inside `place_order` (see the functions migration). As with
 * pricing, this is for display only, the database re-derives all of it under an
 * advisory lock when the order is written, so a stale page can never oversell a
 * day. When the two disagree the customer sees a date vanish with a message
 * rather than an order being taken that cannot be baked.
 */
import {
	addDays,
	addMonths,
	compareDates,
	compareTimes,
	eachDay,
	endOfMonth,
	formatMonth,
	localTimeIn,
	startOfMonth,
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
	PublicCalendarDay,
	PublicCalendarMonth,
	PublicDayState,
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

/** What a weekday rule and any override for the date add up to on that day. */
interface ResolvedDay {
	isOpen: boolean;
	capacity: number;
	orderCount: number;
	/** Can go negative if a day was somehow overbooked. Callers treat <= 0 as full. */
	remaining: number;
	note: string | null;
	hasOverride: boolean;
}

/**
 * The one place a weekday rule and a date's override are combined.
 *
 * All three calendars below need this and used to work it out for themselves,
 * which is three chances to get the precedence wrong on the question the whole
 * shop turns on. An override wins outright on whether the day is open, so a
 * closed Sunday can be opened for a market and an open Saturday shut for a
 * holiday. Capacity is different: an override that leaves it null is saying
 * "open, as usual", so the weekday's own number stands rather than zero.
 */
function resolveDay(
	date: IsoDate,
	rulesByWeekday: Map<Weekday, AvailabilityRule>,
	overridesByDate: Map<IsoDate, AvailabilityOverride>,
	counts: Record<IsoDate, number>,
): ResolvedDay {
	const rule = rulesByWeekday.get(weekdayOf(date));
	const override = overridesByDate.get(date);

	const isOpen = override ? override.isOpen : (rule?.isOpen ?? false);
	const capacity = override?.capacity ?? rule?.capacity ?? 0;
	const orderCount = counts[date] ?? 0;

	return {
		isOpen,
		capacity,
		orderCount,
		remaining: capacity - orderCount,
		note: override?.note ?? null,
		hasOverride: override !== undefined,
	};
}

/**
 * The Monday on or before the first of the month `date` falls in, which is
 * where a Monday-first grid has to start drawing.
 *
 * Where it stops is the caller's business: the admin always draws six rows so
 * its grid does not change height between months, while the public calendar
 * stops at the end of the last week that has a day in it.
 */
function mondayGridStart(date: IsoDate): IsoDate {
	const first = startOfMonth(date);
	const weekday = weekdayOf(first);
	// Monday is 1, so Sunday needs six days of padding rather than none.
	return addDays(first, -(weekday === 0 ? 6 : weekday - 1));
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
		const day = resolveDay(date, rulesByWeekday, overridesByDate, counts);
		if (!day.isOpen || day.remaining <= 0) continue;

		dates.push({ date, remaining: day.remaining, note: day.note });
	}

	return { ordersOpen: true, closedMessage: null, earliest, latest, dates };
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

	const gridStart = mondayGridStart(month);

	const rulesByWeekday = indexRules(rules);
	const overridesByDate = indexOverrides(overrides);
	const monthPrefix = month.slice(0, 7);

	// Six rows always, so the grid does not jump height between months.
	return eachDay(gridStart, addDays(gridStart, 41)).map((date) => {
		const day = resolveDay(date, rulesByWeekday, overridesByDate, counts);

		let state: DayState;
		if (compareDates(date, today) < 0) {
			state = "past";
		} else if (day.hasOverride && !day.isOpen) {
			// Shut by hand, which the owner should see as different from a day she
			// never bakes on: one is a decision she made and can undo here.
			state = "blocked";
		} else if (!day.isOpen) {
			state = "closed";
		} else if (day.orderCount >= day.capacity) {
			state = "full";
		} else {
			state = "open";
		}

		return {
			date,
			weekday: weekdayOf(date),
			inMonth: date.startsWith(monthPrefix),
			state,
			capacity: day.capacity,
			orderCount: day.orderCount,
			note: day.note,
			hasOverride: day.hasOverride,
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
		VARIANT_UNAVAILABLE:
			"One of the flavours you chose has just sold out. Please review your order.",
		VARIANT_REQUIRED: "Something in your order needs a flavour chosen. Please review your order.",
		VARIANT_NOT_FOUND: "One of the flavours you chose is no longer on the menu. Please review it.",
		QTY_BELOW_MINIMUM:
			"Something in your order is under its minimum quantity. Please review your order.",
		QTY_INVALID: "One of the quantities isn't available. Please review your order.",
		PRODUCT_NOT_FOUND: "Something in your order is no longer on the menu. Please review it.",
		SETTINGS_MISSING: "Something went wrong on our end. Please try again shortly.",
	};

	for (const [code, message] of Object.entries(known)) {
		if (raw.includes(code)) return message;
	}
	return "Something went wrong sending your order. Please try again.";
}

/**
 * The calendar customers see.
 *
 * Built from the same rules as everything else, but it answers a different
 * question. The order form asks "which dates may I pick"; this asks "when does
 * this bakery bake", which has to include the days you cannot have, otherwise
 * someone looking on a Tuesday for a Thursday cake just sees a gap and has no
 * idea whether that is a closed day or a full one.
 *
 * It deliberately does not publish how many orders are on a day. "Full" is what
 * a customer can act on; the exact count is the owner's business.
 */
export function buildPublicCalendar(options: {
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
	counts: Record<IsoDate, number>;
	now?: Date;
}): PublicCalendarMonth[] {
	const { settings, rules, overrides, counts } = options;
	const now = options.now ?? new Date();

	const today = todayIn(settings.timezone, now);
	const earliest = earliestPickupDate(settings, now);
	const latest = addDays(today, settings.bookingWindowDays);

	const rulesByWeekday = indexRules(rules);
	const overridesByDate = indexOverrides(overrides);

	// Every month the booking window touches, and never fewer than one.
	const months: IsoDate[] = [];
	for (
		let month = startOfMonth(today);
		compareDates(month, startOfMonth(latest)) <= 0 && months.length < 6;
		month = addMonths(month, 1)
	) {
		months.push(month);
	}

	return months.map((month) => {
		const first = startOfMonth(month);
		const gridStart = mondayGridStart(month);

		const last = endOfMonth(month);
		const trailing = (7 - (weekdayOf(last) === 0 ? 7 : weekdayOf(last))) % 7;
		const gridEnd = addDays(last, trailing);

		const days: PublicCalendarDay[] = eachDay(gridStart, gridEnd).map((date) => {
			const { isOpen, remaining, note } = resolveDay(date, rulesByWeekday, overridesByDate, counts);

			let state: PublicDayState;
			if (compareDates(date, today) < 0) {
				state = "past";
			} else if (!isOpen) {
				state = "closed";
			} else if (compareDates(date, earliest) < 0) {
				// She bakes that day, but there is not enough notice left.
				state = "too-soon";
			} else if (compareDates(date, latest) > 0) {
				state = "not-yet-open";
			} else if (remaining <= 0) {
				state = "full";
			} else {
				state = "available";
			}

			return {
				date,
				weekday: weekdayOf(date),
				inMonth: date.startsWith(month.slice(0, 7)),
				state,
				note,
			};
		});

		return { month: first, label: formatMonth(first), days };
	});
}
