/**
 * Whether a save is allowed to take combinations off a product.
 *
 * An empty submission means "this product is one thing at one price", and
 * acting on it deletes every flavour the product has. That is a real thing she
 * does, so it cannot simply be refused — but it is also what a form that has
 * gone wrong sends, and the delete in `saveVariants` would carry it out before
 * anything else had a chance to fail.
 *
 * So it has to be asked for, and there are two ways of asking. Clearing a
 * combination's price drops it, and the form names every row that costs in
 * `removedVariants` before she presses anything. Turning "This is sold in
 * variants" off drops the lot, and sets `removeVariants`. A row this save would
 * delete that neither of those accounts for is a form that has gone wrong, and
 * is refused here with everything still on the shelf.
 *
 * Returns the sentence to show her, or null when the save may go ahead.
 */

export interface HeldVariant {
	id: string;
	name: string;
}

export interface RemovalRequest {
	/** The combinations the product has right now, straight out of the table. */
	held: HeldVariant[];
	/** The ids among the combinations being submitted, new ones having none. */
	submittedIds: string[];
	/** How many combinations were submitted at all, with or without an id. */
	submittedCount: number;
	/** Set only by turning the variants switch off. */
	removeVariants: boolean;
	/** The rows this save says it knows it is removing. */
	removedVariants: string[];
}

export function refusedRemoval(request: RemovalRequest): string | null {
	const { held, submittedIds, submittedCount, removeVariants, removedVariants } = request;

	const submitted = new Set(submittedIds);
	const asked = new Set(removedVariants);
	const unexpected = held.filter(
		(row) => !submitted.has(row.id) && !asked.has(row.id) && !removeVariants,
	);

	if (unexpected.length > 0) {
		const names = unexpected.map((row) => row.name).join(", ");
		return (
			`Saving would have removed ${names}, which the form did not ask for. ` +
			`Nothing was changed. Give ${unexpected.length === 1 ? "it" : "them"} a price, or ` +
			`turn off "This is sold in variants" to remove them all on purpose.`
		);
	}

	// The check above trusts `removedVariants`, and one shape of submission must
	// not be trusted however it fills that list in: no combinations at all, from
	// a product that has them, without the switch having been turned off. The
	// switch is the only route to emptying a product that the form offers, so an
	// empty grid arriving without it is a form that has lost track of what the
	// product is made of — and naming every row in `removedVariants` is what
	// that looks like rather than permission to go on.
	//
	// It is also exactly what a product looked like the moment it gained a
	// second option group, before `hangCells` in ProductForm carried the prices
	// across: the grid came up blank, every row went into `removedVariants`, and
	// the save took the whole list off a live catalogue and reported success.
	if (submittedCount === 0 && held.length > 0 && !removeVariants) {
		return (
			`Saving would have taken every combination off this product, which the form did not ` +
			`ask for. Nothing was changed. Give at least one of them a price, or turn off ` +
			`"This is sold in variants" to remove them all on purpose.`
		);
	}

	return null;
}
