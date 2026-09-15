"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDateLong, type IsoDate } from "@/lib/dates";
import type { PickableDate, PublicCalendarMonth } from "@/lib/types";
import { CALENDAR_COLUMNS, CalendarLegend, DAY_STATE } from "@/components/ui/calendar-states";

/**
 * Choosing a pickup date on a month calendar.
 *
 * This used to be a rail of pills listing only the bookable dates, which is
 * accurate and tells you nothing: someone hoping for next Saturday sees a gap
 * where it should be and cannot tell whether the bakery is closed that day,
 * whether the day is full, or whether they simply left it too late. A month
 * grid answers that question without anybody having to ask it.
 *
 * Only available days are selectable. The rest are rendered, greyed, and
 * described, because showing a date and then refusing it is worse than never
 * offering it — and the database enforces the same rule again anyway.
 */
export function PickupCalendar({
	months,
	dates,
	value,
	onChange,
	leadTimeDays,
}: {
	months: PublicCalendarMonth[];
	/** The dates actually bookable. */
	dates: PickableDate[];
	value: string;
	onChange: (date: IsoDate) => void;
	leadTimeDays: number;
}) {
	const pickable = useMemo(() => new Map(dates.map((date) => [date.date, date])), [dates]);

	// Open on the month holding the current choice. Derived once: after that the
	// customer is driving, and yanking them back to another month when the
	// selection changes would fight them.
	const [monthIndex, setMonthIndex] = useState(() => {
		const index = months.findIndex((month) => month.month.slice(0, 7) === value.slice(0, 7));
		return index === -1 ? 0 : index;
	});

	const month = months[Math.min(monthIndex, months.length - 1)];
	const chosen = value ? pickable.get(value) : undefined;

	if (dates.length === 0 || !month) {
		return (
			<p className="border-line bg-paper-deep rounded-md border px-4 py-3 text-sm">
				No dates open for booking just now. Follow along on Instagram, that&rsquo;s where new dates
				go up first.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="border-line rounded-lg border p-4 sm:p-5">
				<div className="mb-3 flex items-center justify-between gap-3">
					<MonthButton
						direction="previous"
						disabled={monthIndex === 0}
						onClick={() => setMonthIndex(monthIndex - 1)}
					/>
					{/* aria-live so a screen reader hears the month change; the grid
					    itself is a radio group and says its own dates in full. */}
					<h3
						aria-live="polite"
						className="font-display text-lg">
						{month.label}
					</h3>
					<MonthButton
						direction="next"
						disabled={monthIndex >= months.length - 1}
						onClick={() => setMonthIndex(monthIndex + 1)}
					/>
				</div>

				<fieldset>
					<legend className="sr-only">Choose a pickup date in {month.label}</legend>
					<div className="grid grid-cols-7 gap-1">
						{CALENDAR_COLUMNS.map((column) => (
							<div
								key={column.weekday}
								aria-hidden="true"
								className="text-cocoa-soft text-2xs pb-1 text-center font-medium">
								{column.initial}
							</div>
						))}

						{month.days.map((day) => {
							// Padding days belong to the month either side, which has its
							// own grid a click away. Showing them twice is just noise.
							if (!day.inMonth) {
								return (
									<div
										key={day.date}
										aria-hidden="true"
									/>
								);
							}

							const style = DAY_STATE[day.state];
							const number = Number(day.date.slice(8));
							const slot = pickable.get(day.date);
							const selected = day.date === value;

							// A day the calendar calls available but that is not in the
							// bookable list is a day this form cannot take: trust the list.
							if (day.state !== "available" || !slot) {
								const described = `${formatDateLong(day.date)}: ${style.label}${
									day.note ? `, ${day.note}` : ""
								}`;
								return (
									<div
										key={day.date}
										title={described}
										className={cn(
											"flex aspect-square items-center justify-center rounded-md text-sm",
											day.state === "available" ? DAY_STATE.full.className : style.className,
										)}>
										<span aria-hidden="true">{number}</span>
										<span className="sr-only">{described}</span>
									</div>
								);
							}

							return (
								<label
									key={day.date}
									className={cn(
										"tap-safe focus-within:outline-cocoa relative flex aspect-square cursor-pointer",
										"items-center justify-center rounded-md text-sm transition-colors",
										"focus-within:outline-2 focus-within:outline-offset-2",
										selected ? "border-cocoa bg-rose border font-medium" : style.className,
									)}>
									<input
										type="radio"
										name="pickupDateChoice"
										className="sr-only"
										checked={selected}
										onChange={() => onChange(day.date)}
									/>
									<span aria-hidden="true">{number}</span>
									<span className="sr-only">
										{formatDateLong(day.date)}
										{day.note ? `, ${day.note}` : ""}
									</span>
									{/* A dot rather than the wording: there is no room for the
									    note in a square this size. */}
									{day.note ? (
										<span
											aria-hidden="true"
											className="text-2xs absolute bottom-1 leading-none opacity-60">
											&bull;
										</span>
									) : null}
								</label>
							);
						})}
					</div>
				</fieldset>
			</div>

			<CalendarLegend />

			{/* The choice repeated in words, under the grid. A highlighted square is
			    easy to lose, and easier still once the customer pages to another
			    month, where nothing looks selected at all. */}
			{chosen ? (
				<p className="text-sm">
					<span className="text-cocoa-soft">You&rsquo;ve chosen </span>
					<strong className="font-medium">{formatDateLong(chosen.date)}</strong>
					{chosen.note ? <span className="text-cocoa-soft">. {chosen.note}</span> : null}
				</p>
			) : null}

			{leadTimeDays > 0 ? (
				<p className="text-cocoa-soft text-xs">
					I need {leadTimeDays} day{leadTimeDays === 1 ? "" : "s"} notice, so the next day or two
					are never open.
				</p>
			) : null}
		</div>
	);
}

function MonthButton({
	direction,
	disabled,
	onClick,
}: {
	direction: "previous" | "next";
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			aria-label={`Show the ${direction} month`}
			className="border-line hover:border-cocoa hover:bg-paper-deep grid size-11 shrink-0 place-content-center rounded-md border transition-colors disabled:pointer-events-none disabled:opacity-30">
			<span aria-hidden="true">{direction === "previous" ? "‹" : "›"}</span>
		</button>
	);
}
