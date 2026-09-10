import { cn } from "@/lib/cn";

/** A small rotated label sitting on a product card. */
export function Badge({
	className,
	children,
	tone = "cocoa",
}: {
	className?: string;
	children: React.ReactNode;
	tone?: "cocoa" | "peach" | "mint" | "rose";
}) {
	const tones = {
		cocoa: "bg-cocoa text-paper",
		peach: "bg-peach text-cocoa",
		mint: "bg-mint text-cocoa",
		rose: "bg-rose text-cocoa",
	} as const;

	return (
		<span
			className={cn(
				"rounded-pill text-2xs inline-block -rotate-3 px-3 py-1 font-medium tracking-wide",
				tones[tone],
				className,
			)}>
			{children}
		</span>
	);
}

/** An outlined pill, used for allergens and filters. */
export function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
	return (
		<span
			className={cn(
				"rounded-pill border-line text-2xs text-cocoa-soft inline-flex items-center border px-3 py-1",
				className,
			)}>
			{children}
		</span>
	);
}
