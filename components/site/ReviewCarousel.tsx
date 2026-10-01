"use client";

import { useRef } from "react";
import type { Review } from "@/lib/types";

/**
 * The kind words, one row that scrolls sideways instead of a grid that grows
 * downwards. A grid of every review made the band the longest thing on the
 * page; this keeps it one card tall however many she collects.
 *
 * The sliding is native scroll-snap, so a phone swipes it and a trackpad
 * drags it with no script at all. The buttons are only for a mouse, which has
 * no sideways scroll of its own, and they step one card at a time.
 */
export function ReviewCarousel({ reviews }: { reviews: readonly Review[] }) {
	const track = useRef<HTMLUListElement>(null);

	function step(direction: 1 | -1) {
		const list = track.current;
		const card = list?.firstElementChild as HTMLElement | null;
		if (!list || !card) return;
		// Card width plus the gap, so one press lands on the next snap point.
		const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
		list.scrollBy({ left: direction * (card.offsetWidth + gap), behavior: "smooth" });
	}

	return (
		<div className="flex flex-col gap-4">
			<ul
				ref={track}
				className="-mx-5 flex snap-x snap-mandatory scroll-px-5 gap-6 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:scroll-px-0 sm:px-0">
				{reviews.map((review) => (
					<li
						key={review.id}
						className="w-[85%] shrink-0 snap-start sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]">
						<figure className="border-line bg-paper flex h-full flex-col gap-4 rounded-lg border p-6">
							<blockquote className="font-display text-lg leading-relaxed">
								&ldquo;{review.body}&rdquo;
							</blockquote>
							<figcaption className="text-cocoa-soft mt-auto text-sm">
								{review.author}
								{review.detail ? <span className="block text-xs">{review.detail}</span> : null}
							</figcaption>
						</figure>
					</li>
				))}
			</ul>

			{reviews.length > 1 ? (
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={() => step(-1)}
						aria-label="Previous review"
						className="border-line hover:bg-paper-deep flex h-10 w-10 items-center justify-center rounded-full border">
						<span aria-hidden="true">&larr;</span>
					</button>
					<button
						type="button"
						onClick={() => step(1)}
						aria-label="Next review"
						className="border-line hover:bg-paper-deep flex h-10 w-10 items-center justify-center rounded-full border">
						<span aria-hidden="true">&rarr;</span>
					</button>
				</div>
			) : null}
		</div>
	);
}
