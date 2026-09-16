/**
 * How the admin's price grid is keyed, and how it survives the questions
 * changing underneath it.
 *
 * Lives here rather than beside the form because the form is a `.tsx`, and
 * `vitest.config.mts` matches only `lib/**` and `tests/**` `.ts` files — a test
 * put next to the component would be skipped rather than run. This is the half
 * of the grid worth executing, so it is the half that moved.
 */

/** One option, as far as this file is concerned: something with a stable key. */
export interface KeyedOption {
	key: string;
}

/** One cell: something that may already have a row in the database behind it. */
export interface IdentifiedCell {
	id: string;
}

/** Which combination a grid row is: one option from each group, in order. */
export function cellKey(combination: readonly KeyedOption[]): string {
	return combination.map((option) => option.key).join("|");
}

/**
 * The saved prices, hung onto the combinations the option groups now describe.
 *
 * A cell is keyed by the options it names, so changing which groups a product
 * has changes what every combination is called: "Chocolate" becomes "Chocolate
 * · Small" and "Chocolate · Large", and the other way about when a group is
 * taken away. Looked up by key alone, every saved price then misses and the
 * grid comes up blank.
 *
 * A blank grid is not merely inconvenient. It submits no combinations at all
 * and names every row the product has in `removedVariants`, which is the exact
 * shape `saveVariants` reads as permission to delete them — so adding a second
 * group to a product that had one used to take its whole list off the shelf and
 * report "Product saved."
 *
 * So a combination with no cell of its own inherits from the saved cell that
 * answers the most of it, provided one of the two contains the other: adding a
 * group carries each price onto every combination extending it, and removing
 * one collapses a row of them back onto the first. Half an overlap is not
 * inheritance — it is a different row — and is left alone.
 *
 * The database id is not carried the same way. Two rows cannot hold one id, so
 * it goes to whichever combination inherits it first and the rest arrive as the
 * new rows they are.
 */
export function hangCells<Cell extends IdentifiedCell>(
	combinations: readonly (readonly KeyedOption[])[],
	cells: Record<string, Cell>,
): Record<string, Cell> {
	// Nothing has moved: every combination has a cell of its own. That is every
	// render in which she is only typing prices, so it is worth leaving before
	// walking the saved cells once per combination.
	if (combinations.every((combination) => cells[cellKey(combination)])) return cells;

	const saved = Object.entries(cells).map(([key, cell]) => ({
		cell,
		options: new Set(key.split("|")),
	}));

	const hung: Record<string, Cell> = {};
	const claimed = new Set<string>();

	// Every exact match first, so that no id is taken from the combination it
	// actually belongs to by one that merely overlaps it.
	for (const combination of combinations) {
		const key = cellKey(combination);
		const cell = cells[key];
		if (!cell) continue;
		hung[key] = cell;
		if (cell.id) claimed.add(cell.id);
	}

	for (const combination of combinations) {
		const key = cellKey(combination);
		if (hung[key]) continue;

		const wanted = combination.map((option) => option.key);
		let best: Cell | null = null;
		let bestShared = 0;

		for (const { cell, options } of saved) {
			let shared = 0;
			for (const option of wanted) if (options.has(option)) shared += 1;
			// One has to contain the other. A cell sharing half of this
			// combination and half of another is neither one's price under a
			// new name.
			if (shared !== Math.min(options.size, wanted.length)) continue;
			if (shared > bestShared) {
				best = cell;
				bestShared = shared;
			}
		}

		if (!best) continue;
		const takesId = best.id !== "" && !claimed.has(best.id);
		if (takesId) claimed.add(best.id);
		hung[key] = { ...best, id: takesId ? best.id : "" };
	}

	return hung;
}
