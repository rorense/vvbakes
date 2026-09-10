/**
 * Joins class names, dropping anything falsy.
 *
 * Deliberately not tailwind-merge: components here put their own classes first
 * and the caller's `className` last, so the later utility wins by CSS order.
 */
export function cn(...values: Array<string | false | null | undefined>): string {
	return values.filter(Boolean).join(" ");
}
