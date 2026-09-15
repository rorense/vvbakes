"use client";

import Link, { useLinkStatus } from "next/link";
import { cn } from "@/lib/cn";

/**
 * A navigation link that admits it was tapped.
 *
 * `loading.tsx` covers the wait for a page, but not the wait for the wait. A
 * click starts by fetching the new route, and until that lands the router has
 * not committed anything: no skeleton, no tab highlight moving, nothing on
 * screen different from a second ago. On a phone on mobile data that window is
 * long enough to read as a missed tap and get tapped again. This marks the link
 * that was pressed, under it, for exactly that window — it is gone by the time
 * the skeleton appears, which is the next thing to look at.
 *
 * The mark is deliberately not the active-tab treatment. Two tabs looking
 * equally current is worse than one looking pressed.
 */
export function NavLink({
	className,
	children,
	...rest
}: React.ComponentPropsWithoutRef<typeof Link>) {
	return (
		<Link
			className={cn("relative", className)}
			{...rest}>
			{children}
			<NavLinkPending />
		</Link>
	);
}

/**
 * Has to be a child of the `Link` it reports on — that is how `useLinkStatus`
 * finds which navigation it belongs to.
 */
function NavLinkPending() {
	const { pending } = useLinkStatus();
	if (!pending) return null;

	return (
		<span
			aria-hidden="true"
			className="nav-pending"
		/>
	);
}
