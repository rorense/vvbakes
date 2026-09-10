import { cn } from "@/lib/cn";

/**
 * The small letter-spaced uppercase label above a section, carried over from the
 * printed menu card where it sat above "menu" and "bank details".
 */
export function SectionLabel({
	className,
	children,
	as: Tag = "p",
	id,
}: {
	className?: string;
	children: React.ReactNode;
	as?: "p" | "h1" | "h2" | "h3" | "span";
	id?: string;
}) {
	return (
		<Tag
			id={id}
			className={cn(
				"text-2xs text-cocoa-soft font-sans font-medium tracking-widest uppercase",
				className,
			)}>
			{children}
		</Tag>
	);
}
