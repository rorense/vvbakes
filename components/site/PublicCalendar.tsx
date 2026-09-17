import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatDateLong } from "@/lib/dates";
import type { PublicCalendarMonth } from "@/lib/types";
import { CALENDAR_COLUMNS, CalendarLegend, DAY_STATE } from "@/components/ui/calendar-states";

/**
 * The booking window as she says it rather than as it is stored: "2 months"
 * instead of "60 days", "4 weeks" instead of "28", and plain days when neither
 * divides evenly.
 */
function describeBookingWindow(days: number): string | null {
	if (days <= 0) {
		return null;
	}

	if (days % 30 === 0) {
		const months = days / 30;
		return `${months} month${months === 1 ? "" : "s"}`;
	}

	if (days % 7 === 0) {
		const weeks = days / 7;
		return `${weeks} week${weeks === 1 ? "" : "s"}`;
	}

	return `${days} day${days === 1 ? "" : "s"}`;
}

export function PublicCalendar({
	months,
	leadTimeDays,
	bookingWindowDays,
	className,
}: {
	months: PublicCalendarMonth[];
	leadTimeDays: number;
	bookingWindowDays: number;
	className?: string;
}) {
	const hasAnyAvailable = months.some((month) =>
		month.days.some((day) => day.inMonth && day.state === "available"),
	);

	// Both halves of this are settings, so the sentence is assembled rather than
	// written: either can be changed in /admin/settings and the page has to go on
	// telling the truth.
	const notice =
		leadTimeDays > 0 ? `${leadTimeDays} day${leadTimeDays === 1 ? "" : "s"} notice` : null;
	const bookingWindow = describeBookingWindow(bookingWindowDays);
	const noticeLine = notice
		? bookingWindow
			? ` We need ${notice} and open for bookings ${bookingWindow} in advance.`
			: ` We need ${notice}.`
		: bookingWindow
			? ` Bookings open ${bookingWindow} in advance.`
			: "";

	return (
		<div className={cn("flex flex-col gap-8", className)}>
			<div className="grid gap-8 sm:grid-cols-2 sm:gap-10">
				{months.map((month) => (
					<section
						key={month.month}
						aria-label={month.label}
						className="flex flex-col gap-3">
						<h3 className="font-display text-xl">{month.label}</h3>

						<div
							className="grid grid-cols-7 gap-1"
							role="grid">
							{CALENDAR_COLUMNS.map((column) => (
								<div
									key={column.weekday}
									role="columnheader"
									aria-label={column.name}
									className="text-cocoa-soft text-2xs pb-1 text-center font-medium">
									<span aria-hidden="true">{column.initial}</span>
								</div>
							))}

							{month.days.map((day) => {
								const style = DAY_STATE[day.state];
								const number = Number(day.date.slice(8));

								// Padding days belong to a neighbouring month, which has its
								// own grid. Showing them twice is just noise.
								if (!day.inMonth) {
									return (
										<div
											key={day.date}
											aria-hidden="true"
										/>
									);
								}

								const description = `${formatDateLong(day.date)}: ${style.label}${
									day.note ? `, ${day.note}` : ""
								}`;

								if (day.state === "available") {
									return (
										<Link
											key={day.date}
											href={`/order?date=${day.date}`}
											aria-label={`Order for ${description}`}
											className={cn(
												"tap-safe flex aspect-square flex-col items-center justify-center rounded-md text-sm transition-colors",
												style.className,
											)}>
											<span aria-hidden="true">{number}</span>
											{day.note ? (
												<span
													className="text-2xs leading-tight opacity-70"
													aria-hidden="true">
													&bull;
												</span>
											) : null}
										</Link>
									);
								}

								return (
									<div
										key={day.date}
										title={description}
										className={cn(
											"flex aspect-square items-center justify-center rounded-md text-sm",
											style.className,
										)}>
										<span aria-hidden="true">{number}</span>
										<span className="sr-only">{description}</span>
									</div>
								);
							})}
						</div>
					</section>
				))}
			</div>

			<div className="flex flex-col gap-3">
				<CalendarLegend />

				{hasAnyAvailable ? (
					<p className="text-cocoa-soft text-xs">
						Pick an available green day for your order.
						{noticeLine}
					</p>
				) : (
					<p className="text-cocoa-soft text-xs">
						Nothing is open for booking at the moment. Follow along on Instagram, new dates go up
						there first.
					</p>
				)}
			</div>
		</div>
	);
}
