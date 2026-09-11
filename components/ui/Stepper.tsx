"use client";

import { cn } from "@/lib/cn";

/**
 * Quantity control. Steps by the product's step size, so cookies sold in pairs
 * move 2 at a time and never land on a quantity the database will reject.
 *
 * The current value is announced through an aria-live region rather than a text
 * input, because typing a free number here would let a customer enter a
 * quantity that fails validation only on submit.
 */
export function Stepper({
	value,
	min,
	max,
	step = 1,
	label,
	onChange,
	size = "md",
	className,
}: {
	value: number;
	min: number;
	max: number | null;
	step?: number;
	/** What is being counted, for screen readers: "Cupcakes". */
	label: string;
	onChange: (next: number) => void;
	size?: "sm" | "md";
	className?: string;
}) {
	const canDecrease = value > min;
	const canIncrease = max === null || value + step <= max;

	const button =
		"tap-safe grid place-content-center rounded-pill border border-line text-lg leading-none " +
		"transition-colors hover:border-cocoa hover:bg-paper-deep " +
		"disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent " +
		"disabled:hover:border-line";

	const sizes = {
		sm: { btn: "size-9", value: "w-10 text-sm" },
		md: { btn: "size-11", value: "w-12 text-base" },
	} as const;

	return (
		<div className={cn("flex items-center gap-1", className)}>
			<button
				type="button"
				className={cn(button, sizes[size].btn)}
				onClick={() => onChange(Math.max(min, value - step))}
				disabled={!canDecrease}
				aria-label={`Fewer ${label}`}>
				<span aria-hidden="true">&minus;</span>
			</button>

			<output
				className={cn("text-center font-medium tabular-nums", sizes[size].value)}
				aria-live="polite"
				aria-label={`${label}: ${value}`}>
				{value}
			</output>

			<button
				type="button"
				className={cn(button, sizes[size].btn)}
				onClick={() => onChange(value + step)}
				disabled={!canIncrease}
				aria-label={`More ${label}`}>
				<span aria-hidden="true">+</span>
			</button>
		</div>
	);
}
