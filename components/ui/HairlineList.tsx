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

export function HairlineRow({
	className,
	children,
	as: Tag = "li",
}: {
	className?: string;
	children: React.ReactNode;
	as?: "li" | "div";
}) {
	return (
		<Tag className={cn("flex items-baseline justify-between gap-6 py-4", className)}>
			{children}
		</Tag>
	);
}
