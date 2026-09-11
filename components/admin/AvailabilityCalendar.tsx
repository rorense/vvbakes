"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
	blockRange,
	clearOverride,
	saveOverride,
	saveWeekdayDefaults,
} from "@/app/admin/(dashboard)/actions";
import { EMPTY_FORM_STATE, errorFrom, fieldErrorsFrom } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { addMonths, formatDateLong, formatMonth } from "@/lib/dates";
import type { AvailabilityRule, CalendarDay, DayState, Weekday } from "@/lib/types";
import { WEEKDAY_NAMES } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, FormError, Input, Switch } from "@/components/ui/Form";
import { AdminCard } from "./AdminShell";

const DAY_HEADS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATE_STYLES: Record<DayState, string> = {
	open: "bg-mint/60 text-cocoa",
	full: "bg-peach text-cocoa",
	blocked: "bg-danger-tint text-danger",
	closed: "bg-paper-deep/60 text-cocoa-soft",
	past: "bg-transparent text-cocoa-soft/50",
};

const STATE_LABELS: Record<DayState, string> = {
	open: "Open",
	full: "Full",
	blocked: "Blocked",
	closed: "Closed",
	past: "Past",
};

/**
 * The month view the owner manages her baking days in.
 *
 * Tapping a day opens a sheet rather than expanding a row, because this is used
 * one-handed on a phone: a full-width sheet with big targets beats a cramped
 * popover. The grid is always six rows so it does not jump height between
 * months, and the number in each cell is orders-taken over capacity, which is
 * the thing she actually needs to see at a glance.
 */
export function AvailabilityCalendar({
	month,
	days,
	rules,
	timezone,
}: {
	month: string;
	days: CalendarDay[];
	rules: AvailabilityRule[];
	timezone: string;
}) {
	const [selected, setSelected] = useState<CalendarDay | null>(null);

	return (
		<div className="flex flex-col gap-6">
			<AdminCard>
				<div className="mb-4 flex items-center justify-between gap-3">
					<Link
						href={`/admin/availability?month=${addMonths(month, -1)}`}
						className="border-line hover:border-cocoa grid size-10 place-content-center rounded-md border"
						aria-label="Previous month">
						<span aria-hidden="true">←</span>
					</Link>
					<h2 className="font-display text-xl">{formatMonth(month)}</h2>
					<Link
						href={`/admin/availability?month=${addMonths(month, 1)}`}
						className="border-line hover:border-cocoa grid size-10 place-content-center rounded-md border"
						aria-label="Next month">
						<span aria-hidden="true">→</span>
					</Link>
				</div>

				<div
					className="grid grid-cols-7 gap-1"
					role="grid"
					aria-label={`${formatMonth(month)} availability`}>
					{DAY_HEADS.map((head) => (
						<div
							key={head}
							className="text-cocoa-soft text-2xs pb-1 text-center font-medium"
							role="columnheader">
							{head}
						</div>
					))}

					{days.map((day) => (
						<button
							key={day.date}
							type="button"
							onClick={() => setSelected(day)}
							className={cn(
								"flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-md p-1 text-center transition-opacity hover:opacity-80",
								STATE_STYLES[day.state],
								!day.inMonth && "opacity-40",
								day.hasOverride && "ring-cocoa/30 ring-1 ring-inset",
							)}
							aria-label={`${formatDateLong(day.date)}, ${STATE_LABELS[day.state]}${
								day.state === "open" || day.state === "full"
									? `, ${day.orderCount} of ${day.capacity} taken`
									: ""
							}${day.note ? `, ${day.note}` : ""}`}>
							<span className="text-sm font-medium">{Number(day.date.slice(8))}</span>
							{day.state === "open" || day.state === "full" ? (
								<span className="text-2xs tabular-nums">
									{day.orderCount}/{day.capacity}
								</span>
							) : day.state === "blocked" ? (
								<span
									className="text-2xs"
									aria-hidden="true">
									×
								</span>
							) : null}
						</button>
					))}
				</div>

				<Legend />
			</AdminCard>

			<WeekdayDefaults rules={rules} />

			<BlockRangeForm />

			<p className="text-cocoa-soft text-xs">
				Dates and times are in {timezone.replace("_", " ")}.
			</p>

			{selected ? (
				<DayEditor
					day={selected}
					onClose={() => setSelected(null)}
				/>
			) : null}
		</div>
	);
}

function Legend() {
	const items: Array<{ state: DayState; description: string }> = [
		{ state: "open", description: "taking orders" },
		{ state: "full", description: "at capacity" },
		{ state: "blocked", description: "closed just for that day" },
		{ state: "closed", description: "not a baking day" },
	];

	return (
		<ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
			{items.map((item) => (
				<li
					key={item.state}
					className="text-cocoa-soft flex items-center gap-1.5 text-xs">
					<span
						className={cn("size-3 rounded-sm", STATE_STYLES[item.state])}
						aria-hidden="true"
					/>
					{STATE_LABELS[item.state]}: {item.description}
				</li>
			))}
		</ul>
	);
}

/** The per-day sheet. A native dialog, so Escape and focus trapping come free. */
function DayEditor({ day, onClose }: { day: CalendarDay; onClose: () => void }) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const [state, action, pending] = useActionState(saveOverride, EMPTY_FORM_STATE);
	const [clearing, startClearing] = useTransition();
	const errors = fieldErrorsFrom(state);
	const error = errorFrom(state);

	useEffect(() => {
		dialogRef.current?.showModal();
	}, []);

	const saved = state.result?.ok === true;
	useEffect(() => {
		if (saved) onClose();
	}, [saved, onClose]);

	const isOpenDefault = day.state === "open" || day.state === "full";

	return (
		<dialog
			ref={dialogRef}
			onClose={onClose}
			className="bg-paper text-cocoa backdrop:bg-cocoa/40 m-0 mt-auto w-full max-w-lg rounded-t-lg p-0 sm:m-auto sm:rounded-lg">
			<form
				action={action}
				className="flex flex-col gap-5 p-5 sm:p-6">
				<input
					type="hidden"
					name="date"
					value={day.date}
				/>

				<div className="flex items-start justify-between gap-4">
					<div className="flex flex-col gap-1">
						<h2 className="font-display text-xl">{formatDateLong(day.date)}</h2>
						<p className="text-cocoa-soft text-sm">
							{day.orderCount > 0
								? `${day.orderCount} ${day.orderCount === 1 ? "order" : "orders"} booked`
								: "No orders booked"}
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="border-line hover:border-cocoa grid size-9 shrink-0 place-content-center rounded-md border"
						aria-label="Close">
						<span aria-hidden="true">×</span>
					</button>
				</div>

				<Switch
					name="isOpen"
					label="Baking this day"
					description="Turn off to close just this date, whatever the usual pattern is."
					defaultChecked={isOpenDefault}
				/>

				<Field
					label="Orders you can take"
					hint="Leave blank to use the usual number for that weekday."
					error={errors.capacity}>
					{(props) => (
						<Input
							{...props}
							name="capacity"
							inputMode="numeric"
							defaultValue={day.hasOverride ? String(day.capacity) : ""}
							placeholder={String(day.capacity)}
							invalid={Boolean(errors.capacity)}
						/>
					)}
				</Field>

				<Field
					label="Note"
					hint="Shown to customers on the date, e.g. 'Market day'."
					error={errors.note}>
					{(props) => (
						<Input
							{...props}
							name="note"
							defaultValue={day.note ?? ""}
						/>
					)}
				</Field>

				{day.orderCount > 0 ? (
					<p className="border-line bg-paper-deep rounded-md border px-4 py-3 text-sm">
						There {day.orderCount === 1 ? "is already an order" : "are already orders"} on this day.
						Closing it will not cancel {day.orderCount === 1 ? "it" : "them"}. It only stops new
						ones.
					</p>
				) : null}

				{error ? <FormError>{error}</FormError> : null}

				<div className="flex flex-wrap items-center gap-3">
					<Button
						type="submit"
						disabled={pending}>
						{pending ? "Saving…" : "Save this day"}
					</Button>

					{day.hasOverride ? (
						<button
							type="button"
							disabled={clearing}
							onClick={() =>
								startClearing(async () => {
									await clearOverride(day.date);
									onClose();
								})
							}
							className="text-cocoa-soft hover:text-cocoa text-sm underline underline-offset-4">
							{clearing ? "Resetting…" : "Back to the usual pattern"}
						</button>
					) : null}
				</div>
			</form>
		</dialog>
	);
}

/** The weekly pattern everything else is an exception to. */
function WeekdayDefaults({ rules }: { rules: AvailabilityRule[] }) {
	const [state, action, pending] = useActionState(saveWeekdayDefaults, EMPTY_FORM_STATE);
	const error = errorFrom(state);
	const saved = state.result?.ok === true;

	// Monday first, to match the calendar above.
	const ordered = ([1, 2, 3, 4, 5, 6, 0] as Weekday[]).map(
		(weekday) =>
			rules.find((rule) => rule.weekday === weekday) ?? {
				weekday,
				isOpen: false,
				capacity: 0,
			},
	);

	return (
		<AdminCard title="Your usual week">
			<p className="text-cocoa-soft mb-5 text-sm">
				Which days you normally bake, and how many orders you can take on each. Individual dates can
				override this.
			</p>

			<form
				action={action}
				className="flex flex-col gap-4">
				{ordered.map((rule) => (
					<div
						key={rule.weekday}
						className="flex items-center justify-between gap-4">
						<label className="flex flex-1 items-center gap-3">
							<input
								type="checkbox"
								name={`open-${rule.weekday}`}
								defaultChecked={rule.isOpen}
								className="size-5 shrink-0 accent-[var(--color-rose-deep)]"
							/>
							<span className="text-sm font-medium">{WEEKDAY_NAMES[rule.weekday]}</span>
						</label>

						<label className="flex items-center gap-2">
							<span className="text-cocoa-soft text-xs">orders</span>
							<input
								name={`capacity-${rule.weekday}`}
								inputMode="numeric"
								defaultValue={rule.capacity}
								className="border-line bg-paper focus-visible:border-cocoa w-20 rounded-md border px-3 py-2 text-base"
								aria-label={`Orders you can take on ${WEEKDAY_NAMES[rule.weekday]}`}
							/>
						</label>
					</div>
				))}

				{error ? <FormError>{error}</FormError> : null}

				<div className="flex items-center gap-3">
					<Button
						type="submit"
						disabled={pending}>
						{pending ? "Saving…" : "Save the week"}
					</Button>
					{saved ? (
						<span
							role="status"
							className="text-cocoa-soft text-sm">
							Saved.
						</span>
					) : null}
				</div>
			</form>
		</AdminCard>
	);
}

/** Blocking a holiday one tap at a time would be tedious, so block a range. */
function BlockRangeForm() {
	const [state, action, pending] = useActionState(blockRange, EMPTY_FORM_STATE);
	const errors = fieldErrorsFrom(state);
	const error = errorFrom(state);
	const saved = state.result?.ok === true;

	return (
		<AdminCard title="Block a stretch of days">
			<form
				action={action}
				className="flex flex-col gap-5">
				<div className="grid gap-4 sm:grid-cols-3">
					<Field
						label="From"
						required
						error={errors.from}>
						{(props) => (
							<Input
								{...props}
								name="from"
								type="date"
								invalid={Boolean(errors.from)}
							/>
						)}
					</Field>
					<Field
						label="To"
						required
						error={errors.to}>
						{(props) => (
							<Input
								{...props}
								name="to"
								type="date"
								invalid={Boolean(errors.to)}
							/>
						)}
					</Field>
					<Field
						label="Note"
						hint="Optional, e.g. 'Away'."
						error={errors.note}>
						{(props) => (
							<Input
								{...props}
								name="note"
							/>
						)}
					</Field>
				</div>

				{error ? <FormError>{error}</FormError> : null}

				<div className="flex items-center gap-3">
					<Button
						type="submit"
						variant="secondary"
						disabled={pending}>
						{pending ? "Blocking…" : "Block these dates"}
					</Button>
					{saved ? (
						<span
							role="status"
							className="text-cocoa-soft text-sm">
							Blocked.
						</span>
					) : null}
				</div>
			</form>
		</AdminCard>
	);
}
