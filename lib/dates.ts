/**
 * Calendar dates, handled as plain "YYYY-MM-DD" strings.
 *
 * A pickup date is a date on a wall calendar, not an instant. Representing one
 * as a JavaScript Date invites an offset bug the first time the clocks change or
 * the server runs in a different zone from the bakery. So arithmetic here is
 * done on UTC-anchored calendar values, which have no DST to trip over, and the
 * only place a real timezone is consulted is `todayIn` / `localTimeIn`, where we
 * genuinely need to know what day it is *there*.
 */
import { TZDate } from "@date-fns/tz";
import { WEEKDAY_NAMES, type Weekday } from "./types";

/** A calendar date with no time and no zone. Always "YYYY-MM-DD". */
export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
	if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
	const [y, m, d] = value.split("-").map(Number) as [number, number, number];
	const probe = new Date(Date.UTC(y, m - 1, d));
	return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function assertIso(value: string): asserts value is IsoDate {
	if (!isIsoDate(value)) throw new RangeError(`not a calendar date: ${value}`);
}

/** Midnight UTC on that calendar date, a stable anchor for arithmetic. */
function toUtcDate(date: IsoDate): Date {
	assertIso(date);
	const [y, m, d] = date.split("-").map(Number) as [number, number, number];
	return new Date(Date.UTC(y, m - 1, d));
}

function fromUtcDate(value: Date): IsoDate {
	return value.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
	const anchor = toUtcDate(date);
	anchor.setUTCDate(anchor.getUTCDate() + days);
	return fromUtcDate(anchor);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
	// Zero-padded ISO dates sort correctly as plain strings.
	return a < b ? -1 : a > b ? 1 : 0;
}

/** 0 = Sunday, matching Postgres `extract(dow)` and JavaScript `getDay()`. */
export function weekdayOf(date: IsoDate): Weekday {
	return toUtcDate(date).getUTCDay() as Weekday;
}

/**
 * The order a Monday-first calendar grid lays its columns out in.
 *
 * Both calendars import this rather than typing out their own header row. Two
 * hand-written weekday lists that have to agree with `weekdayOf()` is two too
 * many: get one wrong and every column is labelled with the day beside it.
 */
export const MONDAY_FIRST: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** Every date from `from` to `to`, both ends included. */
export function eachDay(from: IsoDate, to: IsoDate): IsoDate[] {
	const out: IsoDate[] = [];
	for (let d = from; compareDates(d, to) <= 0; d = addDays(d, 1)) {
		out.push(d);
		// Guard against a caller passing a reversed or absurd range.
		if (out.length > 1000) break;
	}
	return out;
}

/** What calendar date it is right now in the given IANA zone. */
export function todayIn(timezone: string, now: Date = new Date()): IsoDate {
	const local = new TZDate(now, timezone);
	const y = local.getFullYear();
	const m = String(local.getMonth() + 1).padStart(2, "0");
	const d = String(local.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/** The local wall-clock time in the given zone, as "HH:MM:SS". */
export function localTimeIn(timezone: string, now: Date = new Date()): string {
	const local = new TZDate(now, timezone);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${pad(local.getHours())}:${pad(local.getMinutes())}:${pad(local.getSeconds())}`;
}

/** Compares "HH:MM" or "HH:MM:SS" values. Postgres hands us the latter. */
export function compareTimes(a: string, b: string): number {
	const normalise = (t: string) => {
		const parts = t.split(":");
		while (parts.length < 3) parts.push("00");
		return parts.map((p) => p.padStart(2, "0")).join(":");
	};
	const left = normalise(a);
	const right = normalise(b);
	return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Sunday-first, matching `getUTCDay()`. The long names come from the single
 * table in lib/types.ts and the short ones are cut from those, so there is no
 * second list of weekday names anywhere to fall out of step.
 */
const WEEKDAY_LONG = ([0, 1, 2, 3, 4, 5, 6] as const).map((day) => WEEKDAY_NAMES[day]);
const WEEKDAY_SHORT = WEEKDAY_LONG.map((name) => name.slice(0, 3));

const MONTH_SHORT = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;
const MONTH_LONG = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
] as const;

/** "Sat 20 Sep", the form the site uses almost everywhere. */
export function formatDateShort(date: IsoDate): string {
	const d = toUtcDate(date);
	return `${WEEKDAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()]}`;
}

/** "Saturday 20 September 2026", for emails and the order status page. */
export function formatDateLong(date: IsoDate): string {
	const d = toUtcDate(date);
	return `${WEEKDAY_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "September 2026", the admin calendar's heading. */
export function formatMonth(date: IsoDate): string {
	const d = toUtcDate(date);
	return `${MONTH_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The first of the month containing `date`. */
export function startOfMonth(date: IsoDate): IsoDate {
	return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: IsoDate): IsoDate {
	const d = toUtcDate(startOfMonth(date));
	d.setUTCMonth(d.getUTCMonth() + 1);
	d.setUTCDate(0);
	return fromUtcDate(d);
}

export function addMonths(date: IsoDate, months: number): IsoDate {
	const d = toUtcDate(startOfMonth(date));
	d.setUTCMonth(d.getUTCMonth() + months);
	return fromUtcDate(d);
}
