/**
 * A scrolling band of short phrases, the bakery-window strip of what's in today.
 *
 * Entirely decorative, and hidden from assistive technology: the same product
 * names are real links a few hundred pixels further down, and hearing them read
 * out twice in a row helps nobody. The content is duplicated so the loop is
 * seamless. The animation is gated behind prefers-reduced-motion in globals.css,
 * where it degrades to a static row.
 */
export function Marquee({ items }: { items: string[] }) {
	if (items.length === 0) return null;

	const run = (key: string) => (
		<div
			key={key}
			className="flex shrink-0 items-center">
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
						✦
					</span>
				</span>
			))}
		</div>
	);

	return (
		<div
			className="overflow-hidden py-4"
			aria-hidden="true">
			<div className="marquee-track">
				{run("a")}
				{run("b")}
			</div>
		</div>
	);
}
