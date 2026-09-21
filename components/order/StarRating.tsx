"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";

const STARS = [1, 2, 3, 4, 5] as const;

/**
 * Five stars for one product, and the option of saying nothing.
 *
 * Radio buttons rather than a row of divs with click handlers, because that is
 * what this is: one choice out of five, which arrows between with a keyboard
 * and announces itself to a screen reader without any help from us. The stars
 * are the labels. Everything visual here is CSS on `peer-checked`; nothing
 * about the choice lives in React state except the hover preview.
 *
 * It starts on nothing, and `Clear` puts it back. That matters more than it
 * looks: the form's whole bargain is that the words are the favour and the
 * stars are optional, and a control with no way back to "unanswered" quietly
 * makes them compulsory the moment somebody taps one by accident.
 */
export function StarRating({
	name,
	label,
	defaultValue = null,
}: {
	/** The form field, `rating:<productId>`. */
	name: string;
	/** What is being rated, read out as the group's label. */
	label: string;
	defaultValue?: number | null;
}) {
	const groupId = useId();
	const [chosen, setChosen] = useState<number | null>(defaultValue);
	const [hovered, setHovered] = useState<number | null>(null);

	// The hover preview fills up to whatever is under the cursor; with nothing
	// under it, back to what is actually chosen.
	const lit = hovered ?? chosen ?? 0;

	return (
		<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
			<span
				id={groupId}
				className="text-sm">
				{label}
			</span>

			<div className="flex items-center gap-1">
				<div
					role="radiogroup"
					aria-labelledby={groupId}
					className="flex items-center"
					onMouseLeave={() => setHovered(null)}>
					{STARS.map((value) => (
						<label
							key={value}
							className="cursor-pointer p-0.5"
							onMouseEnter={() => setHovered(value)}>
							<input
								type="radio"
								name={name}
								value={value}
								checked={chosen === value}
								onChange={() => setChosen(value)}
								className="peer sr-only"
							/>
							{/* The accessible name says the number, because "★★★" read
							    aloud is five identical words. */}
							<span className="sr-only">{value} out of 5</span>
							<svg
								aria-hidden="true"
								viewBox="0 0 20 20"
								className={cn(
									"peer-focus-visible:outline-cocoa size-6 transition-colors peer-focus-visible:rounded-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
									value <= lit ? "fill-cocoa" : "fill-line",
								)}>
								<path d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L10 14.77l-5.2 2.73.99-5.78-4.21-4.1 5.82-.85L10 1.5z" />
							</svg>
						</label>
					))}
				</div>

				{/* Only offered once there is something to clear, so the row does not
				    carry a dead control for every product nobody has rated. */}
				<button
					type="button"
					onClick={() => setChosen(null)}
					className={cn(
						"text-cocoa-soft hover:text-cocoa ml-1 text-xs underline underline-offset-4",
						chosen === null && "invisible",
					)}
					aria-label={`Clear the rating for ${label}`}>
					Clear
				</button>
			</div>
		</div>
	);
}
