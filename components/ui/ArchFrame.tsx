import { cn } from "@/lib/cn";

/**
 * The site's photo frame: an arch, tall and round-topped like a shop window.
 * `soft` rounds the top corners instead of arching them, for grids where a row
 * of full arches would be too insistent.
 */
export function ArchFrame({
	className,
	children,
	tone = "blush",
	shape = "arch",
}: {
	className?: string;
	/** Optional: a frame with nothing in it yet is what a loading photo looks like. */
	children?: React.ReactNode;
	tone?: "blush" | "rose" | "butter" | "mint" | "peach" | "paper-deep";
	shape?: "arch" | "soft";
}) {
	const tones = {
		blush: "bg-blush",
		rose: "bg-rose",
		butter: "bg-butter",
		mint: "bg-mint",
		peach: "bg-peach",
		"paper-deep": "bg-paper-deep",
	} as const;

	return (
		<div
			className={cn(shape === "arch" ? "arch" : "arch-soft", "relative", tones[tone], className)}>
			{children}
		</div>
	);
}
