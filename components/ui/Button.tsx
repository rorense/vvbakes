import Link from "next/link";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
	primary: "bg-rose text-cocoa hover:bg-rose-deep border border-transparent",
	secondary: "bg-transparent text-cocoa border border-line hover:border-cocoa hover:bg-paper-deep",
	ghost:
		"bg-transparent text-cocoa-soft border border-transparent hover:text-cocoa hover:bg-paper-deep",
	danger: "bg-danger text-paper border border-transparent hover:opacity-90",
};

const SIZES: Record<ButtonSize, string> = {
	// 44px minimum touch target on every size.
	sm: "min-h-11 px-4 text-sm",
	md: "min-h-11 px-6 text-sm",
	lg: "min-h-13 px-8 text-base",
};

const BASE =
	"inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-colors " +
	"disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
	variant = "primary",
	size = "md",
	className,
	type = "button",
	...rest
}: React.ComponentPropsWithoutRef<"button"> & {
	variant?: ButtonVariant;
	size?: ButtonSize;
}) {
	return (
		<button
			type={type}
			className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
			{...rest}
		/>
	);
}

/** A link that looks like a button. Use for navigation, never for actions. */
export function ButtonLink({
	variant = "primary",
	size = "md",
	className,
	...rest
}: React.ComponentPropsWithoutRef<typeof Link> & {
	variant?: ButtonVariant;
	size?: ButtonSize;
}) {
	return (
		<Link
			className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
			{...rest}
		/>
	);
}
