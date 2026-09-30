import { cn } from "@/lib/cn";

/** The site's single content column. Everything lines up to this. */
export function Container({
	className,
	children,
	width = "default",
}: {
	className?: string;
	children: React.ReactNode;
	width?: "default" | "narrow" | "wide";
}) {
	const widths = {
		narrow: "max-w-2xl",
		default: "max-w-5xl",
		wide: "max-w-6xl",
	} as const;

	return (
		<div className={cn("mx-auto w-full px-5 sm:px-8", widths[width], className)}>{children}</div>
	);
}

/** Vertical rhythm between the bands of a page. */
export function Section({
	className,
	children,
	id,
	tone = "paper",
	size = "default",
	...rest
}: React.ComponentPropsWithoutRef<"section"> & {
	tone?: "paper" | "blush" | "rose" | "butter";
	size?: "default" | "tight" | "loose";
}) {
	const tones = {
		paper: "bg-paper",
		blush: "bg-blush",
		rose: "bg-rose",
		butter: "bg-butter",
	} as const;

	const sizes = {
		tight: "py-10 sm:py-12",
		default: "py-14 sm:py-20",
		loose: "py-20 sm:py-28",
	} as const;

	return (
		<section
			id={id}
			className={cn(tones[tone], sizes[size], className)}
			{...rest}>
			{children}
		</section>
	);
}
