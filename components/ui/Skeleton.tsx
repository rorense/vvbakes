import { cn } from "@/lib/cn";

/**
 * The shape of something that has not arrived yet.
 *
 * Used by the `loading.tsx` files, which Next renders the instant a navigation
 * starts and swaps out when the server's own markup arrives. The point is not
 * decoration: without one, clicking "Orders" on a phone on mobile data leaves
 * the previous page frozen on screen with no sign anything happened, and the
 * owner taps it again.
 *
 * Bars are sized to the real thing they stand in for, so the swap does not
 * shove the page around. `animate-pulse` is behind `motion-safe`, because a
 * whole screen of throbbing blocks is exactly what someone who turned motion
 * off was turning off.
 */
export function Skeleton({ className }: { className?: string }) {
	return (
		<span
			aria-hidden="true"
			className={cn("bg-paper-deep block rounded-md motion-safe:animate-pulse", className)}
		/>
	);
}

/**
 * Wraps a screen's worth of skeletons.
 *
 * One polite sentence for screen readers, which otherwise get read a page of
 * nothing at all, and `aria-busy` so assistive tech knows more is coming.
 */
export function SkeletonScreen({
	label = "Loading",
	children,
}: {
	label?: string;
	children: React.ReactNode;
}) {
	return (
		<div aria-busy="true">
			<span className="sr-only" role="status">
				{label}
			</span>
			{children}
		</div>
	);
}
