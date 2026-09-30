import { cn } from "@/lib/cn";

/** A small rotated label sitting on a product card. */
export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
	return (
		<span
			className={cn(
				"rounded-pill text-2xs bg-cocoa text-paper inline-block -rotate-3 px-3 py-1 font-medium tracking-wide",
				className,
			)}>
			{children}
		</span>
	);
}

/** An outlined pill, used for allergens. */
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
