import { cn } from "@/lib/cn";

/**
 * A round paper sticker, slightly tilted, of the kind stuck on a bakery box.
 * Used sparingly, one per page at most, to break an otherwise tidy grid.
 */
export function Sticker({
	className,
	children,
	tone = "rose-deep",
	size = "md",
}: {
	className?: string;
	children: React.ReactNode;
	tone?: "rose-deep" | "rose" | "mint" | "peach" | "butter" | "cocoa";
	size?: "sm" | "md";
}) {
	const tones = {
		"rose-deep": "bg-rose-deep text-cocoa",
		rose: "bg-rose text-cocoa",
		mint: "bg-mint text-cocoa",
		peach: "bg-peach text-cocoa",
		butter: "bg-butter text-cocoa",
		cocoa: "bg-cocoa text-paper",
	} as const;

	const sizes = {
		sm: "w-24 p-3 text-2xs",
		// The step up waits for `lg`, because the only `md` sticker hangs off the
		// home hero's arch and that arch is capped until `lg` too. Growing at `sm`
		// put a 144px sticker on a 256px arch, over the badge's own wordmark.
		md: "w-32 p-4 text-xs lg:w-36",
	} as const;

	return (
		<span className={cn("sticker font-medium", tones[tone], sizes[size], className)}>
			{children}
		</span>
	);
}
