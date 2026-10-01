"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { Review } from "@/lib/types";

/** How long each card sits before the row moves on by itself. */
const AUTO_ADVANCE_MS = 4000;

/**
 * The kind words, one row that scrolls sideways instead of a grid that grows
 * downwards. A grid of every review made the band the longest thing on the
 * page; this keeps it one card tall however many she collects.
 *
 * The sliding is native scroll-snap, so a phone swipes it and a trackpad
 * drags it with no script at all. The buttons are only for a mouse, which has
 * no sideways scroll of its own, and they step one card at a time.
 *
 * It also moves on by itself, wrapping to the start at the end. Moving text is
 * hard to read and harder still for some people, so it holds still while the
 * pointer or keyboard focus is on it, stops for good once someone swipes it
 * (they are reading at their own pace now), and never starts at all for a
 * visitor whose device asks for reduced motion.
 */
export function ReviewCarousel({ reviews }: { reviews: readonly Review[] }) {
	const root = useRef<HTMLDivElement>(null);
	const track = useRef<HTMLUListElement>(null);

	useEffect(() => {
		const box = root.current;
		const list = track.current;
		if (!box || !list || reviews.length < 2) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

		let held = false;
		const hold = () => (held = true);
		// Either one alone still holds it: a keyboard user may have the pointer
		// parked elsewhere, and a mouse user may have clicked an arrow and moved on.
		const release = () => (held = box.matches(":hover") || box.matches(":focus-within"));
		const timer = window.setInterval(() => {
			if (held) return;
			const atEnd = list.scrollLeft + list.clientWidth >= list.scrollWidth - 1;
			if (atEnd) list.scrollTo({ left: 0, behavior: "smooth" });
			else stepList(list, 1);
		}, AUTO_ADVANCE_MS);
		const stop = () => window.clearInterval(timer);

		box.addEventListener("pointerenter", hold);
		box.addEventListener("pointerleave", release);
		box.addEventListener("focusin", hold);
		box.addEventListener("focusout", release);
		list.addEventListener("touchstart", stop, { passive: true });
		return () => {
			stop();
			box.removeEventListener("pointerenter", hold);
			box.removeEventListener("pointerleave", release);
			box.removeEventListener("focusin", hold);
			box.removeEventListener("focusout", release);
			list.removeEventListener("touchstart", stop);
		};
	}, [reviews.length]);

	function step(direction: 1 | -1) {
		if (track.current) stepList(track.current, direction);
	}

	return (
		<div
			ref={root}
			className="flex flex-col gap-4">
			<ul
				ref={track}
				className="-mx-5 flex snap-x snap-mandatory scroll-px-5 [scrollbar-width:none] gap-6 overflow-x-auto px-5 pb-2 sm:mx-0 sm:scroll-px-0 sm:px-0">
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
						<Arrow className="rotate-180" />
					</button>
					<button
						type="button"
						onClick={() => step(1)}
						aria-label="Next review"
						className="border-line hover:bg-paper-deep flex h-10 w-10 items-center justify-center rounded-full border">
						<Arrow />
					</button>
				</div>
			) : null}
		</div>
	);
}

/**
 * A drawn arrow, pointing right. Drawn rather than typed because a text arrow
 * comes from whichever font the phone falls back to, so the two buttons came
 * out different sizes on some devices.
 */
function Arrow({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			className={cn("h-4 w-4", className)}
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round">
			<path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" />
		</svg>
	);
}

/** Scroll the row one card along: the card's width plus the gap, so it lands on the next snap point. */
function stepList(list: HTMLElement, direction: 1 | -1) {
	const card = list.firstElementChild as HTMLElement | null;
	if (!card) return;
	const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
	list.scrollBy({ left: direction * (card.offsetWidth + gap), behavior: "smooth" });
}
