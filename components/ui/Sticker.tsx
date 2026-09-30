import { cn } from "@/lib/cn";

/**
 * A round paper sticker, slightly tilted, of the kind stuck on a bakery box.
 * Used sparingly, one per page at most, to break an otherwise tidy grid.
 */
export function Sticker({
	className,
	children,
}: {
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<span
			className={cn("sticker bg-rose-deep text-cocoa text-2xs w-24 p-3 font-medium", className)}>
			{children}
		</span>
	);
}
