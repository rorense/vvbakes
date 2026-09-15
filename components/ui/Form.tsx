"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

const CONTROL =
	"w-full rounded-md border border-line bg-paper px-4 py-3 text-base text-cocoa " +
	"placeholder:text-cocoa-soft/60 focus-visible:border-cocoa transition-colors " +
	"disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Label, hint and error for one control, wired together for screen readers.
 *
 * Children receive the generated id plus `aria-describedby` and `aria-invalid`,
 * so a field is never left with a floating error that assistive technology
 * cannot associate with it.
 */
export function Field({
	label,
	hint,
	error,
	required,
	className,
	children,
}: {
	label: string;
	hint?: string;
	error?: string;
	required?: boolean;
	className?: string;
	children: (props: {
		id: string;
		"aria-describedby": string | undefined;
		"aria-invalid": boolean | undefined;
		required: boolean | undefined;
	}) => React.ReactNode;
}) {
	const id = useId();
	const hintId = hint ? `${id}-hint` : undefined;
	const errorId = error ? `${id}-error` : undefined;
	const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

	return (
		/*
		 * Label on top, control in the middle, hint and error underneath.
		 *
		 * The hint used to sit between the label and the control, which quietly
		 * broke every two-column row where one field had a hint and its neighbour
		 * did not: the two inputs ended up 26px apart. Putting the hint below
		 * means the label and the control are the only things above the fold of
		 * the field, both fixed height, so controls line up across a row whatever
		 * else each field is carrying.
		 *
		 * `self-start` matters too: grid cells stretch to the tallest in the row by
		 * default, and a field with nothing under its control would otherwise have
		 * that space distributed inside it.
		 */
		<div className={cn("flex flex-col gap-2 self-start", className)}>
			<label
				htmlFor={id}
				className="text-sm font-medium">
				{label}
				{required ? (
					<span
						className="text-cocoa-soft"
						aria-hidden="true">
						{" "}
						*
					</span>
				) : (
					<span className="text-cocoa-soft text-xs font-normal"> (optional)</span>
				)}
			</label>

			<div>
				{children({
					id,
					"aria-describedby": describedBy,
					"aria-invalid": error ? true : undefined,
					required: required || undefined,
				})}
			</div>

			{hint ? (
				<p
					id={hintId}
					className="text-cocoa-soft text-xs">
					{hint}
				</p>
			) : null}

			{error ? (
				<p
					id={errorId}
					className="text-danger text-xs font-medium">
					{error}
				</p>
			) : null}
		</div>
	);
}

export function Input({
	className,
	invalid,
	...rest
}: React.ComponentPropsWithoutRef<"input"> & { invalid?: boolean }) {
	return (
		<input
			className={cn(CONTROL, invalid && "border-danger", className)}
			{...rest}
		/>
	);
}

export function Textarea({
	className,
	invalid,
	...rest
}: React.ComponentPropsWithoutRef<"textarea"> & { invalid?: boolean }) {
	return (
		<textarea
			className={cn(CONTROL, "min-h-28 resize-y", invalid && "border-danger", className)}
			{...rest}
		/>
	);
}

export function Select({
	className,
	invalid,
	children,
	...rest
}: React.ComponentPropsWithoutRef<"select"> & { invalid?: boolean }) {
	return (
		<select
			className={cn(CONTROL, "appearance-none pr-10", invalid && "border-danger", className)}
			{...rest}>
			{children}
		</select>
	);
}

/** A labelled on/off switch. Submits as a checkbox so it works in a plain form. */
export function Switch({
	label,
	description,
	className,
	...rest
}: React.ComponentPropsWithoutRef<"input"> & {
	label: string;
	description?: string;
}) {
	const id = useId();
	return (
		<div className={cn("flex items-start gap-3", className)}>
			<input
				id={id}
				type="checkbox"
				role="switch"
				className="mt-1 size-5 shrink-0 accent-[var(--color-rose-deep)]"
				{...rest}
			/>
			<div className="flex flex-col gap-1">
				<label
					htmlFor={id}
					className="text-sm font-medium">
					{label}
				</label>
				{description ? <p className="text-cocoa-soft text-xs">{description}</p> : null}
			</div>
		</div>
	);
}

export function Checkbox({
	label,
	className,
	...rest
}: React.ComponentPropsWithoutRef<"input"> & { label: string }) {
	const id = useId();
	return (
		<div className={cn("flex items-center gap-3", className)}>
			<input
				id={id}
				type="checkbox"
				className="size-5 shrink-0 accent-[var(--color-rose-deep)]"
				{...rest}
			/>
			<label
				htmlFor={id}
				className="text-sm">
				{label}
			</label>
		</div>
	);
}

/** An error summary shown above a form's submit button. */
export function FormError({ children }: { children: React.ReactNode }) {
	if (!children) return null;
	return (
		<p
			role="alert"
			className="border-danger bg-danger-tint text-danger rounded-md border px-4 py-3 text-sm">
			{children}
		</p>
	);
}
