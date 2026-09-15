/**
 * How the shop addresses someone by name.
 *
 * Shared rather than written twice because the thank-you page and the
 * confirmation email land within a second of each other, and greeting the same
 * customer two different ways in that second would read as two different shops.
 * Whatever this does with initials, double-barrelled names or a single word, it
 * has to do in both places.
 */
export function firstName(full: string): string {
	return full.trim().split(/\s+/)[0] ?? full;
}
