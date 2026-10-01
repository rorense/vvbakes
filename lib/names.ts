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

/** "a", "a and b", "a, b and c": how the shop lists things in a sentence. */
export function andList(items: readonly string[]): string {
	if (items.length < 2) return items.join("");
	return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
