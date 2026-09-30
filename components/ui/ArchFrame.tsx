import { cn } from "@/lib/cn";

/**
 * The site's photo frame: an arch, tall and round-topped like a shop window.
 */
export function ArchFrame({
	className,
	children,
	tone = "blush",
}: {
	className?: string;
	/** Optional: a frame with nothing in it yet is what a loading photo looks like. */
	children?: React.ReactNode;
	tone?: "blush" | "butter";
}) {
	const tones = {
		blush: "bg-blush",
		butter: "bg-butter",
	} as const;

	return <div className={cn("arch relative", tones[tone], className)}>{children}</div>;
}
