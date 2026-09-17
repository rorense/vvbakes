"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatDateShort } from "@/lib/dates";
import type { FeedbackWithOrder } from "@/lib/types";
import { useToastedTransition } from "@/components/ui/Toast";

/**
 * One piece of feedback, with the two things that can be done to it.
 *
 * The consent answer is the loudest thing on the card after the words
 * themselves, because it decides whether the publish button exists at all. A
 * "no" is not a failure and is not hidden: she still wants to read it, and it
 * is still the only feedback that order will ever give her.
 *
 * Actions come in from the server component rather than being imported, so this
 * stays a dumb client component and the authorisation stays server-side, the
 * same arrangement as ProductRow.
 */
export function FeedbackRow({
	feedback,
	timezone,
	onPublish,
	onDelete,
}: {
	feedback: FeedbackWithOrder;
	/** The bakery's zone, so "received" reads as the day she would call it. */
	timezone: string;
	onPublish: (id: string) => Promise<void>;
	onDelete: (id: string) => Promise<void>;
}) {
	const [pending, run] = useToastedTransition();
	const [confirmingDelete, setConfirmingDelete] = useState(false);

	const chip =
		"rounded-pill border px-2.5 py-1 text-2xs font-medium transition-colors disabled:opacity-50";

	const received = new Date(feedback.createdAt).toLocaleString("en-NZ", {
		timeZone: timezone,
		dateStyle: "medium",
	});

	return (
		<li
			className={cn(
				"border-line flex flex-col gap-3 rounded-lg border p-4 sm:p-5",
				pending && "opacity-60",
			)}>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex min-w-0 flex-col gap-0.5">
					<p className="font-medium">{feedback.author}</p>
					<p className="text-cocoa-soft text-xs">
						<Link
							href={`/admin/orders/${feedback.orderId}`}
							className="underline underline-offset-2">
							{feedback.reference}
						</Link>
						{feedback.pickupDate ? ` · ${formatDateShort(feedback.pickupDate)}` : ""}
						{/* Worth saying when the two differ: the name that goes on the
						    website is the one they typed, and she may only recognise the
						    one on the order. */}
						{feedback.customerName && feedback.customerName !== feedback.author
							? ` · ordered by ${feedback.customerName}`
							: ""}
						{` · heard back ${received}`}
					</p>
				</div>

				<span
					className={cn(
						"rounded-pill text-2xs shrink-0 px-2.5 py-1 font-medium",
						feedback.consented ? "bg-mint text-cocoa" : "bg-paper-deep text-cocoa-soft",
					)}>
					{feedback.consented ? "Can be shown" : "Private"}
				</span>
			</div>

			<p className="text-sm whitespace-pre-wrap">{feedback.body}</p>

			<div className="flex flex-wrap items-center gap-2">
				{feedback.publishedAt ? (
					<>
						<span className={cn(chip, "bg-rose border-transparent")}>On the website</span>
						<Link
							href="/admin/settings#reviews"
							className={cn(chip, "border-line hover:border-cocoa")}>
							Edit or remove it
						</Link>
					</>
				) : feedback.consented ? (
					<button
						type="button"
						disabled={pending}
						onClick={() =>
							run(
								() => onPublish(feedback.id),
								"That couldn't be put on the website. Please try again.",
								`${feedback.author} is on the home page. Word the line under the name in Settings.`,
							)
						}
						className={cn(chip, "bg-rose hover:bg-rose-deep border-transparent")}>
						Put it on the website
					</button>
				) : (
					<span className="text-cocoa-soft text-xs">
						They didn&rsquo;t agree to this being shown, so it stays between you.
					</span>
				)}

				{confirmingDelete ? (
					<span className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							disabled={pending}
							onClick={() =>
								run(
									() => onDelete(feedback.id),
									"That couldn't be deleted. Please try again.",
									"Deleted.",
								)
							}
							className={cn(chip, "border-danger text-danger")}>
							Delete for good
						</button>
						<button
							type="button"
							onClick={() => setConfirmingDelete(false)}
							className={cn(chip, "border-line text-cocoa-soft")}>
							Keep
						</button>
						{/* Said here rather than in a toast afterwards, because afterwards
						    is too late: deleting the feedback does not take the review
						    down, and she would have no way left of finding which one it
						    was. */}
						{feedback.publishedAt ? (
							<span className="text-danger text-xs">
								This stays on the website. Remove it in Settings as well.
							</span>
						) : null}
					</span>
				) : (
					<button
						type="button"
						onClick={() => setConfirmingDelete(true)}
						className={cn(chip, "border-line text-cocoa-soft hover:border-danger ml-auto")}>
						Delete
					</button>
				)}
			</div>
		</li>
	);
}
