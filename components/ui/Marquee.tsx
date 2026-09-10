import { cn } from "@/lib/cn";

/**
 * A scrolling band of short phrases. The content is duplicated so the loop is
 * seamless; the copy is hidden from assistive technology so nothing is read out
 * twice. The animation itself is gated behind prefers-reduced-motion in
 * globals.css, where it degrades to a static row.
 */
export function Marquee({
	items,
	className,
	separator = "✦",
}: {
	items: string[];
	className?: string;
	separator?: string;
}) {
	if (items.length === 0) return null;

	const run = (hidden: boolean) => (
		<div
			className="flex shrink-0 items-center"
			aria-hidden={hidden || undefined}>
			{items.map((item, index) => (
				<span
					key={`${item}-${index}`}
					className="flex items-center">
					<span className="font-display px-5 text-lg whitespace-nowrap sm:px-7 sm:text-xl">
						{item}
					</span>
					<span
						className="text-cocoa-soft/60 text-xs"
						aria-hidden="true">
						{separator}
					</span>
				</span>
			))}
		</div>
	);

	return (
		<div className={cn("overflow-hidden py-4", className)}>
			<div className="marquee-track">
				{run(false)}
				{run(true)}
			</div>
		</div>
	);
}
