import { cn } from "@/lib/cn";

/**
 * The rule-separated list from the original printed menu card. Reused for the
 * "how ordering works" steps, price tables and order summaries so the site keeps
 * feeling like the card it grew out of.
 */
export function HairlineList({
	className,
	children,
	as: Tag = "ul",
}: {
	className?: string;
	children: React.ReactNode;
	as?: "ul" | "ol" | "dl" | "div";
}) {
	return <Tag className={cn("hairline-list list-none", className)}>{children}</Tag>;
}

/**
 * `align` is a prop rather than something the caller passes through `className`
 * because `items-baseline` and `items-center` are the same Tailwind property:
 * which one won would depend on stylesheet order, not on what the caller wrote.
 */
export function HairlineRow({
	className,
	children,
	as: Tag = "li",
	align = "baseline",
}: {
	className?: string;
	children: React.ReactNode;
	as?: "li" | "div";
	align?: "baseline" | "center" | "start";
}) {
	const alignment = {
		baseline: "items-baseline",
		center: "items-center",
		start: "items-start",
	} as const;

	return (
		<Tag className={cn("flex justify-between gap-6 py-4", alignment[align], className)}>
			{children}
		</Tag>
	);
}
