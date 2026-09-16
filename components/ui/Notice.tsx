import { cn } from "@/lib/cn";

/**
 * A bordered paragraph that says something the reader has to take in before
 * carrying on.
 *
 * There were thirteen of these written out by hand, in three tones that had
 * drifted into four spellings of the same class list. They are worth telling
 * apart, so the tone is a word rather than a colour:
 *
 *   neutral   Something happened, or is worth knowing. "An item in your order
 *             is no longer available." "This one has no price on it yet."
 *   warning   What the button you are about to press will cost. Untinted,
 *             because nothing has gone wrong yet and a red panel over a form
 *             she has not submitted reads as a failure. "Saving now removes
 *             Chocolate · 3 layers."
 *   danger    Something is wrong right now. Tinted, because it wants finding.
 *             "Email isn't configured, so nothing is being sent."
 *
 * `role` is the caller's, because it depends on how the notice arrived rather
 * than on how it looks: one that appears in response to a submission is a
 * `status` or an `alert`, and one that was on the page all along is neither.
 */
const TONES = {
	neutral: "border-line bg-paper-deep",
	warning: "border-danger text-danger",
	danger: "border-danger bg-danger-tint text-danger",
} as const;

export type NoticeTone = keyof typeof TONES;

export function Notice({
	tone = "neutral",
	className,
	children,
	...rest
}: React.ComponentPropsWithoutRef<"p"> & { tone?: NoticeTone }) {
	return (
		<p
			className={cn("rounded-md border px-4 py-3 text-sm", TONES[tone], className)}
			{...rest}>
			{children}
		</p>
	);
}
