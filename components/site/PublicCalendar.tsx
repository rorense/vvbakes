import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatDateLong } from "@/lib/dates";
import type { PublicCalendarMonth, PublicDayState } from "@/lib/types";

const WEEKDAY_HEADS = ["M", "T", "W", "T", "F", "S", "S"];
const WEEKDAY_NAMES = [
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
	"Sunday",
];

/**
 * How each state reads to a customer, and how it is described to a screen
 * reader. The wording matters more than usual here: "closed" and "too soon" are
 * the same blank square to someone scanning, and they mean very different
 * things to someone deciding whether to bother asking.
 */
const STATE: Record<PublicDayState, { className: string; label: string }> = {
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
const LEGEND: PublicDayState[] = ["available", "full", "too-soon"];

const LEGEND_COPY: Partial<Record<PublicDayState, string>> = {
	available: "Open for orders",
	full: "Fully booked",
	"too-soon": "Not enough notice",
};

export function PublicCalendar({
	months,
	leadTimeDays,
	className,
}: {
	months: PublicCalendarMonth[];
	leadTimeDays: number;
	className?: string;
}) {
	const hasAnyAvailable = months.some((month) =>
		month.days.some((day) => day.inMonth && day.state === "available"),
	);

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
							{WEEKDAY_HEADS.map((head, index) => (
								<div
									key={`${head}-${index}`}
									role="columnheader"
									aria-label={WEEKDAY_NAMES[index]}
									className="text-cocoa-soft text-2xs pb-1 text-center font-medium">
									<span aria-hidden="true">{head}</span>
								</div>
							))}

							{month.days.map((day) => {
								const style = STATE[day.state];
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
				<ul className="flex flex-wrap gap-x-5 gap-y-2">
					{LEGEND.map((state) => (
						<li
							key={state}
							className="text-cocoa-soft flex items-center gap-2 text-xs">
							<span
								className={cn("size-3.5 shrink-0 rounded-sm", STATE[state].className)}
								aria-hidden="true"
							/>
							{LEGEND_COPY[state]}
						</li>
					))}
				</ul>

				{hasAnyAvailable ? (
					<p className="text-cocoa-soft text-xs">
						Pick a green day to start an order.
						{leadTimeDays > 0
							? ` We need ${leadTimeDays} day${leadTimeDays === 1 ? "" : "s"} notice, so the next day or two are never open.`
							: ""}
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
