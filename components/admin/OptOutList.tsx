"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatStamp } from "@/lib/dates";
import type { FeedbackOptOut } from "@/lib/types";
import { useToastedTransition } from "@/components/ui/Toast";

/**
 * Everyone who asked not to be sent feedback requests.
 *
 * Here so that a customer writing "I told you to stop" can be answered from the
 * admin instead of taken on trust, and so the one-click button in Gmail can be
 * seen to be working: a row saying "their mail app" is proof the
 * List-Unsubscribe header is being read.
 *
 * Putting somebody back is behind a confirm, because it is the one control on
 * this page that undoes a decision a customer made rather than one she made.
 */
export function OptOutList({
	optOuts,
	timezone,
	onResubscribe,
}: {
	optOuts: FeedbackOptOut[];
	timezone: string;
	onResubscribe: (email: string) => Promise<void>;
}) {
	if (optOuts.length === 0) return null;

	return (
		<section className="border-line mt-8 rounded-lg border p-4 sm:p-6">
			<h2 className="font-display mb-1 text-lg">Asked not to be asked</h2>
			<p className="text-cocoa-soft mb-4 text-sm">
				These addresses get no feedback request. They still get every email about an order they
				place, because those are the order. Only put someone back if they ask you to.
			</p>

			<ul className="hairline-list">
				{optOuts.map((optOut) => (
					<Row
						key={optOut.email}
						optOut={optOut}
						timezone={timezone}
						onResubscribe={onResubscribe}
					/>
				))}
			</ul>
		</section>
	);
}

function Row({
	optOut,
	timezone,
	onResubscribe,
}: {
	optOut: FeedbackOptOut;
	timezone: string;
	onResubscribe: (email: string) => Promise<void>;
}) {
	const [pending, run] = useToastedTransition();
	const [confirming, setConfirming] = useState(false);

	const chip =
		"rounded-pill border px-2.5 py-1 text-2xs font-medium transition-colors disabled:opacity-50";

	const when = formatStamp(optOut.createdAt, timezone);

	return (
		<li
			className={cn(
				"flex flex-wrap items-center justify-between gap-3 py-3",
				pending && "opacity-60",
			)}>
			<span className="flex min-w-0 flex-col gap-0.5">
				<span className="truncate text-sm font-medium">{optOut.email}</span>
				<span className="text-cocoa-soft text-xs">
					{when} · {optOut.source === "one-click" ? "their mail app" : "the link in the email"}
				</span>
			</span>

			{confirming ? (
				<span className="flex items-center gap-2">
					<button
						type="button"
						disabled={pending}
						onClick={() =>
							run(
								() => onResubscribe(optOut.email),
								"That couldn't be undone. Please try again.",
								`${optOut.email} will be asked about their next order.`,
							)
						}
						className={cn(chip, "border-danger text-danger")}>
						Yes, ask them again
					</button>
					<button
						type="button"
						onClick={() => setConfirming(false)}
						className={cn(chip, "border-line text-cocoa-soft")}>
						Leave it
					</button>
				</span>
			) : (
				<button
					type="button"
					onClick={() => setConfirming(true)}
					className={cn(chip, "border-line text-cocoa-soft hover:border-cocoa")}>
					Put them back
				</button>
			)}
		</li>
	);
}
