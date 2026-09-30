/**
 * The two things every hand-ordered list in the admin does to itself.
 *
 * The questions, the reviews, and a product's extras, price guide, gallery and
 * option groups are all edited as a draft array held in React state and
 * submitted as one JSON field, and the first ones used to carry their own copy
 * of these. They are four lines each, which is exactly the size at which copies
 * stop being worth noticing and start quietly disagreeing: the swap in
 * particular is easy to write in a way that drops a row when the neighbour is
 * the last one.
 *
 * Both return a new array. Nothing here mutates what it was given, because the
 * callers hand the result straight to a setState.
 */

/** The same list with `patch` merged into the row at `index`. */
export function patchItem<T>(items: T[], index: number, patch: Partial<T>): T[] {
	return items.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

/**
 * The same list with the row at `index` swapped with its neighbour. Returns the
 * list untouched when there is no neighbour that way, so a caller can wire this
 * to a button without checking the ends itself.
 */
export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
	const to = index + direction;
	if (to < 0 || to >= items.length) return items;

	const next = [...items];
	[next[index], next[to]] = [next[to]!, next[index]!];
	return next;
}
