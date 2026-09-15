import { describe, expect, it } from "vitest";
import {
	buildCalendarMonth,
	buildPublicCalendar,
	computeAvailability,
	earliestPickupDate,
	orderErrorMessage,
	type AvailabilityInput,
} from "./availability";
import { addDays, formatDateShort, todayIn, weekdayOf } from "./dates";
import type { AvailabilityOverride, AvailabilityRule, Weekday } from "./types";

const NZ = "Pacific/Auckland";

/** Open every day with the given capacity. */
function openAllWeek(capacity = 5): AvailabilityRule[] {
	return ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((weekday) => ({
		weekday,
		isOpen: true,
		capacity,
	}));
}

function closedAllWeek(): AvailabilityRule[] {
	return ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((weekday) => ({
		weekday,
		isOpen: false,
		capacity: 0,
	}));
}

function input(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
	return {
		settings: {
			ordersOpen: true,
			ordersClosedMessage: null,
			leadTimeDays: 2,
			cutoffTime: "20:00:00",
			bookingWindowDays: 28,
			timezone: NZ,
			...overrides.settings,
		},
		rules: overrides.rules ?? openAllWeek(),
		overrides: overrides.overrides ?? [],
		counts: overrides.counts ?? {},
		now: overrides.now ?? new Date("2026-09-14T02:00:00Z"), // 2pm Monday in NZ
	};
}

describe("earliestPickupDate", () => {
	const settings = { leadTimeDays: 2, cutoffTime: "20:00:00", timezone: NZ };

	it("adds the lead time before the cut-off", () => {
		// 7:59pm Tuesday 15 September 2026 in Auckland (UTC+12).
		const now = new Date("2026-09-15T07:59:00Z");
		expect(todayIn(NZ, now)).toBe("2026-09-15");
		expect(earliestPickupDate(settings, now)).toBe("2026-09-17");
	});

	it("adds one more day after the cut-off", () => {
		// 8:01pm the same Tuesday.
		const now = new Date("2026-09-15T08:01:00Z");
		expect(todayIn(NZ, now)).toBe("2026-09-15");
		expect(earliestPickupDate(settings, now)).toBe("2026-09-18");
	});

	it("treats the cut-off minute itself as still open", () => {
		const now = new Date("2026-09-15T08:00:00Z"); // exactly 20:00:00
		expect(earliestPickupDate(settings, now)).toBe("2026-09-17");
	});

	it("uses the bakery's day, not the server's", () => {
		// 11pm UTC on 14 September is already 11am on the 15th in Auckland.
		const now = new Date("2026-09-14T23:00:00Z");
		expect(todayIn(NZ, now)).toBe("2026-09-15");
		expect(todayIn("UTC", now)).toBe("2026-09-14");
		expect(earliestPickupDate(settings, now)).toBe("2026-09-17");
	});

	it("survives the New Zealand daylight saving changes", () => {
		// NZDT starts 27 September 2026 (UTC+12 to +13) and ends 5 April 2026.
		const beforeSpringForward = new Date("2026-09-26T06:00:00Z"); // 6pm Sat 26th NZST
		expect(todayIn(NZ, beforeSpringForward)).toBe("2026-09-26");
		expect(earliestPickupDate(settings, beforeSpringForward)).toBe("2026-09-28");

		const afterSpringForward = new Date("2026-09-27T06:00:00Z"); // 7pm Sun 27th NZDT
		expect(todayIn(NZ, afterSpringForward)).toBe("2026-09-27");
		expect(earliestPickupDate(settings, afterSpringForward)).toBe("2026-09-29");

		// The day the clocks go back is still one calendar day long.
		const autumn = new Date("2026-04-05T02:00:00Z"); // 3pm Sun 5 April NZST
		expect(todayIn(NZ, autumn)).toBe("2026-04-05");
		expect(earliestPickupDate(settings, autumn)).toBe("2026-04-07");
	});

	it("allows same-day pickup when there is no lead time", () => {
		const now = new Date("2026-09-15T02:00:00Z");
		expect(earliestPickupDate({ ...settings, leadTimeDays: 0 }, now)).toBe("2026-09-15");
	});
});

describe("computeAvailability", () => {
	it("offers every open day from the earliest to the end of the window", () => {
		const result = computeAvailability(input());
		expect(result.ordersOpen).toBe(true);
		expect(result.earliest).toBe("2026-09-16");
		expect(result.latest).toBe("2026-10-12");
		expect(result.dates).toHaveLength(27);
		expect(result.dates[0]!.date).toBe("2026-09-16");
		expect(result.dates.at(-1)!.date).toBe("2026-10-12");
	});

	it("returns nothing but a message when orders are paused", () => {
		const result = computeAvailability(
			input({
				settings: {
					ordersOpen: false,
					ordersClosedMessage: "Back after the school holidays",
					leadTimeDays: 2,
					cutoffTime: "20:00:00",
					bookingWindowDays: 28,
					timezone: NZ,
				},
			}),
		);
		expect(result.ordersOpen).toBe(false);
		expect(result.closedMessage).toBe("Back after the school holidays");
		expect(result.dates).toEqual([]);
	});

	it("only offers the weekdays that are open", () => {
		const rules = closedAllWeek();
		rules[6] = { weekday: 6, isOpen: true, capacity: 4 }; // Saturdays only

		const result = computeAvailability(input({ rules }));
		expect(result.dates.length).toBeGreaterThan(0);
		for (const date of result.dates) {
			expect(weekdayOf(date.date)).toBe(6);
		}
	});

	it("subtracts existing orders from the day's capacity", () => {
		const result = computeAvailability(
			input({ rules: openAllWeek(3), counts: { "2026-09-16": 1 } }),
		);
		expect(result.dates[0]).toEqual({
			date: "2026-09-16",
			remaining: 2,
			note: null,
		});
		expect(result.dates[1]!.remaining).toBe(3);
	});

	it("drops a day once it is full", () => {
		const result = computeAvailability(
			input({ rules: openAllWeek(2), counts: { "2026-09-16": 2 } }),
		);
		expect(result.dates.map((d) => d.date)).not.toContain("2026-09-16");
	});

	it("drops a day that is somehow overbooked", () => {
		const result = computeAvailability(
			input({ rules: openAllWeek(2), counts: { "2026-09-16": 5 } }),
		);
		expect(result.dates.map((d) => d.date)).not.toContain("2026-09-16");
	});

	it("lets a closed override beat an open weekday", () => {
		const overrides: AvailabilityOverride[] = [
			{ date: "2026-09-16", isOpen: false, capacity: null, note: "Away" },
		];
		const result = computeAvailability(input({ overrides }));
		expect(result.dates.map((d) => d.date)).not.toContain("2026-09-16");
	});

	it("lets an open override beat a closed weekday, and carries its note", () => {
		const overrides: AvailabilityOverride[] = [
			{ date: "2026-09-19", isOpen: true, capacity: 8, note: "Market day" },
		];
		const result = computeAvailability(input({ rules: closedAllWeek(), overrides }));
		expect(result.dates).toEqual([{ date: "2026-09-19", remaining: 8, note: "Market day" }]);
	});

	it("inherits the weekday capacity when an override leaves it null", () => {
		const overrides: AvailabilityOverride[] = [
			{ date: "2026-09-19", isOpen: true, capacity: null, note: null },
		];
		const result = computeAvailability(input({ rules: openAllWeek(7), overrides }));
		const day = result.dates.find((d) => d.date === "2026-09-19");
		expect(day?.remaining).toBe(7);
	});

	it("treats an open override with zero capacity as unbookable", () => {
		const overrides: AvailabilityOverride[] = [
			{ date: "2026-09-19", isOpen: true, capacity: 0, note: null },
		];
		const result = computeAvailability(input({ overrides }));
		expect(result.dates.map((d) => d.date)).not.toContain("2026-09-19");
	});

	it("includes the very last day of the booking window", () => {
		const result = computeAvailability(input({}));
		expect(result.dates.at(-1)!.date).toBe(result.latest);
	});

	it("returns no dates when the lead time exceeds the booking window", () => {
		const result = computeAvailability(
			input({
				settings: {
					ordersOpen: true,
					ordersClosedMessage: null,
					leadTimeDays: 30,
					cutoffTime: "20:00:00",
					bookingWindowDays: 7,
					timezone: NZ,
				},
			}),
		);
		expect(result.dates).toEqual([]);
	});

	it("has no open days at all when every weekday is closed", () => {
		expect(computeAvailability(input({ rules: closedAllWeek() })).dates).toEqual([]);
	});
});

describe("buildCalendarMonth", () => {
	const options = {
		month: "2026-09-15",
		rules: openAllWeek(3),
		overrides: [] as AvailabilityOverride[],
		counts: {} as Record<string, number>,
		timezone: NZ,
		now: new Date("2026-09-14T02:00:00Z"),
	};

	it("returns a complete six-week grid starting on a Monday", () => {
		const days = buildCalendarMonth(options);
		expect(days).toHaveLength(42);
		expect(weekdayOf(days[0]!.date)).toBe(1);
		expect(days[0]!.date).toBe("2026-08-31");
	});

	it("marks which days belong to the month being viewed", () => {
		const days = buildCalendarMonth(options);
		expect(days.filter((d) => d.inMonth)).toHaveLength(30);
		expect(days[0]!.inMonth).toBe(false);
	});

	it("shows past days as past, whatever the weekday rule says", () => {
		const days = buildCalendarMonth(options);
		expect(days.find((d) => d.date === "2026-09-01")!.state).toBe("past");
		expect(days.find((d) => d.date === "2026-09-13")!.state).toBe("past");
	});

	it("distinguishes a blocked day from a day the bakery never opens", () => {
		const rules = openAllWeek(3);
		rules[0] = { weekday: 0, isOpen: false, capacity: 0 };

		const days = buildCalendarMonth({
			...options,
			rules,
			overrides: [{ date: "2026-09-19", isOpen: false, capacity: null, note: "Away" }],
		});

		expect(days.find((d) => d.date === "2026-09-19")!.state).toBe("blocked");
		expect(days.find((d) => d.date === "2026-09-19")!.note).toBe("Away");
		expect(days.find((d) => d.date === "2026-09-20")!.state).toBe("closed"); // a Sunday
	});

	it("marks a day at capacity as full and carries the counts through", () => {
		const days = buildCalendarMonth({
			...options,
			counts: { "2026-09-19": 3 },
		});
		const day = days.find((d) => d.date === "2026-09-19")!;
		expect(day.state).toBe("full");
		expect(day.orderCount).toBe(3);
		expect(day.capacity).toBe(3);
	});

	it("still shows a day as open when it has some orders but room left", () => {
		const days = buildCalendarMonth({
			...options,
			counts: { "2026-09-19": 1 },
		});
		expect(days.find((d) => d.date === "2026-09-19")!.state).toBe("open");
	});

	it("handles February in a leap year", () => {
		const days = buildCalendarMonth({ ...options, month: "2028-02-10" });
		expect(days.filter((d) => d.inMonth)).toHaveLength(29);
	});
});

describe("formatDateShort", () => {
	it("reads the way the site writes dates", () => {
		expect(formatDateShort("2026-09-19")).toBe("Sat 19 Sep");
		expect(formatDateShort("2026-01-01")).toBe("Thu 1 Jan");
	});

	it("is not shifted by the machine's timezone", () => {
		// A naive `new Date("2026-09-19")` renders as the 18th west of Greenwich.
		expect(formatDateShort(addDays("2026-09-18", 1))).toBe("Sat 19 Sep");
	});
});

describe("orderErrorMessage", () => {
	it("translates the database's exception names", () => {
		expect(orderErrorMessage("... DATE_FULL ...")).toContain("just filled up");
		expect(orderErrorMessage("QTY_INVALID")).toContain("quantities");
		expect(orderErrorMessage("ORDERS_CLOSED")).toContain("paused");
	});

	it("does not leak an unrecognised database error", () => {
		const message = orderErrorMessage(
			'duplicate key value violates unique constraint "orders_reference_key"',
		);
		expect(message).toBe("Something went wrong sending your order. Please try again.");
	});
});

describe("buildPublicCalendar", () => {
	const base = {
		settings: {
			ordersOpen: true,
			ordersClosedMessage: null,
			leadTimeDays: 2,
			cutoffTime: "20:00:00",
			bookingWindowDays: 28,
			timezone: NZ,
		},
		rules: openAllWeek(3),
		overrides: [] as AvailabilityOverride[],
		counts: {} as Record<string, number>,
		now: new Date("2026-09-14T02:00:00Z"), // 2pm Monday 14 September in NZ
	};

	function dayOf(months: ReturnType<typeof buildPublicCalendar>, date: string) {
		for (const month of months) {
			const found = month.days.find((day) => day.date === date);
			if (found) return found;
		}
		return undefined;
	}

	it("covers every month the booking window touches", () => {
		const months = buildPublicCalendar(base);
		expect(months.map((m) => m.label)).toEqual(["September 2026", "October 2026"]);
	});

	it("lays each month out Monday first with whole weeks", () => {
		const [september] = buildPublicCalendar(base);
		expect(september!.days.length % 7).toBe(0);
		expect(september!.days[0]!.weekday).toBe(1);
		expect(september!.days.at(-1)!.weekday).toBe(0);
	});

	it("marks days before today as past", () => {
		const months = buildPublicCalendar(base);
		expect(dayOf(months, "2026-09-13")!.state).toBe("past");
	});

	it("separates 'not enough notice' from 'not baking'", () => {
		// Monday the 14th with two days' notice: the 15th is a baking day but too
		// soon, the 16th is the first one anyone can actually have.
		const months = buildPublicCalendar(base);
		expect(dayOf(months, "2026-09-15")!.state).toBe("too-soon");
		expect(dayOf(months, "2026-09-16")!.state).toBe("available");
	});

	it("shows a day the bakery never opens as closed, not as too-soon", () => {
		const rules = closedAllWeek();
		rules[6] = { weekday: 6, isOpen: true, capacity: 3 };
		const months = buildPublicCalendar({ ...base, rules });

		expect(dayOf(months, "2026-09-16")!.state).toBe("closed"); // a Wednesday
		expect(dayOf(months, "2026-09-19")!.state).toBe("available"); // Saturday
	});

	it("shows a booked-out day as full", () => {
		const months = buildPublicCalendar({ ...base, counts: { "2026-09-19": 3 } });
		expect(dayOf(months, "2026-09-19")!.state).toBe("full");
	});

	it("shows days past the booking window as not yet open", () => {
		const months = buildPublicCalendar(base);
		// The window ends 28 days after the 14th, so 13 October is one too far.
		expect(dayOf(months, "2026-10-12")!.state).toBe("available");
		expect(dayOf(months, "2026-10-13")!.state).toBe("not-yet-open");
	});

	it("carries an override's note through to the customer", () => {
		const overrides: AvailabilityOverride[] = [
			{ date: "2026-09-19", isOpen: true, capacity: 8, note: "Market day" },
		];
		const months = buildPublicCalendar({ ...base, overrides });
		expect(dayOf(months, "2026-09-19")!.note).toBe("Market day");
	});

	it("shows a day she blocked by hand as full, not as a day she never bakes", () => {
		// Both mean "not then", but only one of them looks deliberate in a week
		// she otherwise works.
		const overrides: AvailabilityOverride[] = [
			{ date: "2026-09-19", isOpen: false, capacity: null, note: "Away" },
		];
		const months = buildPublicCalendar({ ...base, overrides });
		expect(dayOf(months, "2026-09-19")!.state).toBe("full");
	});

	it("still shows a weekday she never bakes as closed, override or not", () => {
		// The block only speaks for the date it is on. A Sunday she has never
		// worked is not something she decided this week.
		const rules = openAllWeek(3);
		rules[0] = { weekday: 0, isOpen: false, capacity: 0 };
		const overrides: AvailabilityOverride[] = [
			{ date: "2026-09-19", isOpen: false, capacity: null, note: "Away" },
		];
		const months = buildPublicCalendar({ ...base, rules, overrides });

		expect(dayOf(months, "2026-09-19")!.state).toBe("full"); // Saturday, blocked
		expect(dayOf(months, "2026-09-20")!.state).toBe("closed"); // Sunday, never open
	});

	it("does not colour a day an override opens as blocked", () => {
		// An override can open a normally-closed day as well as shut an open one,
		// and only the shutting kind is a day nobody can have.
		const rules = closedAllWeek();
		const overrides: AvailabilityOverride[] = [
			{ date: "2026-09-19", isOpen: true, capacity: 3, note: "Market day" },
		];
		const months = buildPublicCalendar({ ...base, rules, overrides });
		expect(dayOf(months, "2026-09-19")!.state).toBe("available");
	});

	it("never publishes how many orders are on a day", () => {
		const months = buildPublicCalendar({ ...base, counts: { "2026-09-19": 2 } });
		const day = dayOf(months, "2026-09-19")!;
		expect(Object.keys(day)).toEqual(["date", "weekday", "inMonth", "state", "note"]);
	});

	it("agrees with the order form about which dates are bookable", () => {
		const overrides: AvailabilityOverride[] = [
			{ date: "2026-09-19", isOpen: false, capacity: null, note: null },
		];
		const input = { ...base, overrides, counts: { "2026-09-18": 3 } };

		const bookable = new Set(computeAvailability(input).dates.map((d) => d.date));
		const shownAvailable = buildPublicCalendar(input)
			.flatMap((month) => month.days)
			.filter((day) => day.inMonth && day.state === "available")
			.map((day) => day.date);

		for (const date of shownAvailable) {
			expect(bookable.has(date), `${date} shown as available`).toBe(true);
		}
	});
});
