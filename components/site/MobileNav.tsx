"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NavLink } from "@/components/ui/NavLink";

export type NavItem = { href: string; label: string };

/**
 * The phone's copy of the main navigation, behind a hamburger.
 *
 * The header only has room for the wordmark and two or three pill links before
 * the two collide, which is why "Availability" used to be dropped below 26rem
 * and the Instagram handle below 40rem. A sheet fits all of them at a readable
 * size, so nothing has to be hidden from a phone any more.
 *
 * A native `dialog` rather than a div: Escape, the focus trap, returning focus
 * to the button on close and locking the page behind it all come free, and the
 * admin's day editor already uses one, so this is the shape the repo knows.
 */
export function MobileNav({
	links,
	instagramHandle,
	instagramHref,
	brand,
	homeLabel,
}: {
	links: NavItem[];
	instagramHandle: string;
	instagramHref: string;
	/** The header's logo and wordmark, so the sheet can put back what it covers. */
	brand: React.ReactNode;
	/** Accessible name for the brand, which is a link home in here as it is out there. */
	homeLabel: string;
}) {
	const dialogRef = useRef<HTMLDialogElement>(null);
	const [open, setOpen] = useState(false);
	const pathname = usePathname();

	// The sheet deliberately stays up while a page is on its way, so the mark
	// NavLink draws under the tapped row is visible for the whole wait rather
	// than the screen dropping back to the page you were already looking at.
	// This is what shuts it: the new path arriving. A tap on the page you are
	// already on never changes the path, so those close themselves on click.
	//
	// Adjusted during the render rather than in an effect, which is React's own
	// advice for state that follows a changing input: the discarded render never
	// reaches the DOM, so the sheet does not flash open on the new page first.
	const [shownFor, setShownFor] = useState(pathname);
	if (pathname !== shownFor) {
		setShownFor(pathname);
		setOpen(false);
	}

	// `showModal()` is imperative, so the boolean above drives the element and
	// this is what keeps the two agreeing. `onClose` below is the return leg,
	// covering the ways the browser shuts it on its own, Escape chief of them.
	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	}, [open]);

	const close = () => setOpen(false);

	/**
	 * Opens the element as well as setting the state, which looks redundant and
	 * is not. If the browser ever shuts the sheet without `onClose` reaching
	 * React, the two disagree: the state still says open, so a press sets it to
	 * a value it already holds, nothing re-renders, the effect never runs and
	 * the menu can never be opened again. Calling `showModal()` here means the
	 * element wins that argument and the button always does something.
	 */
	const openSheet = () => {
		const dialog = dialogRef.current;
		if (dialog && !dialog.open) dialog.showModal();
		setOpen(true);
	};

	const row =
		"hover:bg-paper-deep font-display flex min-h-14 items-center px-5 text-xl transition-colors";

	return (
		<>
			<button
				type="button"
				onClick={openSheet}
				aria-expanded={open}
				aria-controls="mobile-nav"
				aria-label="Menu"
				className="hover:bg-paper-deep rounded-pill -mr-1.5 grid size-11 place-content-center transition-colors sm:hidden">
				<svg
					aria-hidden="true"
					viewBox="0 0 20 20"
					className="size-5"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.8"
					strokeLinecap="round">
					<path d="M3 5.5h14M3 10h14M3 14.5h14" />
				</svg>
			</button>

			{/* Outside the `sm:hidden` above on purpose. A sheet inside a hidden
			    subtree stops being drawn if the phone is turned mid-tap, but stays
			    open as far as the browser is concerned, which leaves the page under
			    it locked with nothing on screen to unlock it. */}
			<dialog
				id="mobile-nav"
				ref={dialogRef}
				onClose={close}
				// A click on the backdrop is reported against the dialog itself, so
				// this only fires for the paper either side of the sheet's contents.
				onClick={(event) => {
					if (event.target === event.currentTarget) close();
				}}
				className="bg-paper text-cocoa backdrop:bg-cocoa/40 nav-sheet m-0 max-h-dvh w-full max-w-none overflow-y-auto p-0">
				<div className="flex h-16 items-center justify-between gap-4 px-5">
					<NavLink
						href="/"
						aria-label={homeLabel}
						onClick={() => {
							if (samePath("/", pathname)) close();
						}}
						className="tap-safe flex min-w-0 items-center gap-2">
						{brand}
					</NavLink>
					<button
						type="button"
						onClick={close}
						aria-label="Close menu"
						className="hover:bg-paper-deep rounded-pill -mr-1.5 grid size-11 place-content-center transition-colors">
						<svg
							aria-hidden="true"
							viewBox="0 0 20 20"
							className="size-5"
							fill="none"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round">
							<path d="M5 5l10 10M15 5L5 15" />
						</svg>
					</button>
				</div>

				<nav
					aria-label="Main"
					className="hairline-list flex flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))]">
					{links.map((link) => (
						<NavLink
							key={link.href}
							href={link.href}
							onClick={() => {
								if (samePath(link.href, pathname)) close();
							}}
							className={row}>
							{link.label}
						</NavLink>
					))}
					<a
						href={instagramHref}
						target="_blank"
						rel="noopener noreferrer"
						onClick={close}
						className={row}>
						@{instagramHandle}
					</a>
				</nav>
			</dialog>
		</>
	);
}

/**
 * Whether a nav href points at the page already on screen, hash and trailing
 * slash aside. "/#dates" tapped from the home page is the one that matters: it
 * scrolls rather than navigates, so no new path ever arrives to shut the sheet.
 */
function samePath(href: string, pathname: string): boolean {
	const trim = (value: string) => value.replace(/\/+$/, "") || "/";
	return trim(href.split("#")[0] || "/") === trim(pathname);
}
