import { MAX_INSPIRATION_PHOTOS } from "./constants";
import type { CartBrief } from "./types";

/**
 * What a customer said about one line: a note, a link, some photos, and — on
 * the products that ask — a flavour of their own and what the frosting should
 * be.
 *
 * Shared by the picker that writes one, the cart that stores it, and the order
 * form that sends it, so all three agree on when two briefs are the same brief
 * and on what an empty one looks like. The database checks the same lengths
 * again on the way in; these are here so a note typed into a textarea cannot
 * quietly fill the cart's storage quota before it ever gets that far.
 */

/** Matches the check constraint on `order_items.note`. */
export const MAX_BRIEF_NOTE = 1000;

/** Matches the check constraint on `order_items.custom_flavour`. */
export const MAX_BRIEF_FLAVOUR = 200;

/** Matches the check constraint on `order_items.frosting`. */
export const MAX_BRIEF_FROSTING = 200;

/**
 * Matches the order form's own limit on a link, which is deliberately short of
 * the column's 500 so that prepending a scheme to a bare "pinterest.com/…" can
 * never overflow it.
 */
export const MAX_BRIEF_URL = 480;

/**
 * A brief with its blanks removed, or undefined when there was nothing in it.
 *
 * Undefined rather than an empty object, because absent is what most lines are
 * and what every cart saved before briefs existed looks like: the two have to
 * be indistinguishable or an old line and a new empty one would be two lines.
 */
export function normaliseBrief(brief: CartBrief | null | undefined): CartBrief | undefined {
	if (!brief) return undefined;

	const note = (brief.note ?? "").trim().slice(0, MAX_BRIEF_NOTE);
	const inspirationUrl = (brief.inspirationUrl ?? "").trim().slice(0, MAX_BRIEF_URL);
	// Order is kept rather than sorted: someone who put the cake they liked
	// first meant it first, and that is part of what they said.
	const photoIds = (brief.photoIds ?? [])
		.filter((id) => typeof id === "string" && id !== "")
		.slice(0, MAX_INSPIRATION_PHOTOS);

	const customFlavour = (brief.customFlavour ?? "").trim().slice(0, MAX_BRIEF_FLAVOUR);
	// The tick box and the frosting text are one answer to one question, so the
	// tick wins and the text goes. `place_order` does the same before it groups,
	// which is what keeps a line that sent both on the same line as one that
	// sent only the tick.
	const frostingMatchesFlavour = brief.frostingMatchesFlavour === true;
	const frosting = frostingMatchesFlavour
		? ""
		: (brief.frosting ?? "").trim().slice(0, MAX_BRIEF_FROSTING);

	if (
		note === "" &&
		inspirationUrl === "" &&
		photoIds.length === 0 &&
		customFlavour === "" &&
		frosting === "" &&
		!frostingMatchesFlavour
	) {
		return undefined;
	}

	const next: CartBrief = {};
	if (note !== "") next.note = note;
	if (inspirationUrl !== "") next.inspirationUrl = inspirationUrl;
	if (photoIds.length > 0) next.photoIds = photoIds;
	if (customFlavour !== "") next.customFlavour = customFlavour;
	if (frosting !== "") next.frosting = frosting;
	// Written only when true. False and absent are the same answer, and a line
	// saved before this existed has to key the same as one saved since.
	if (frostingMatchesFlavour) next.frostingMatchesFlavour = true;
	return next;
}

/**
 * True when something was asked of the flavour or the frosting.
 *
 * Takes the three fields rather than a brief, so it reads an `OrderItem` as
 * happily as a `CartBrief` — the names are the same on both sides of the
 * order — and so the basket, the order page, the owner's email and the admin
 * all agree about which lines this is. They have to: it is what decides whether
 * a customer is told the price might still move, and whether the owner is given
 * anywhere to move it.
 */
export function hasCustomFlavour(line: {
	customFlavour?: string | null;
	frosting?: string | null;
	frostingMatchesFlavour?: boolean | null;
}): boolean {
	return Boolean(
		(line.customFlavour ?? "").trim() ||
		(line.frosting ?? "").trim() ||
		line.frostingMatchesFlavour,
	);
}

/**
 * What to show where the frosting is described, or null when nothing was said.
 *
 * One sentence, written once, because the basket, the order page, the admin and
 * the owner's email all have to say the same thing about it — and because
 * "matching the flavour" is an answer with no text of its own, so every one of
 * them would otherwise reinvent the wording for a ticked box.
 *
 * Takes the two fields rather than a brief, so it reads an `OrderItem` as
 * happily as a `CartBrief`: the same answer, before and after it becomes an
 * order.
 */
export function frostingLabel(
	frosting: string | null | undefined,
	frostingMatchesFlavour: boolean | null | undefined,
): string | null {
	if (frostingMatchesFlavour) return "To match the flavour";
	const wanted = (frosting ?? "").trim();
	return wanted === "" ? null : wanted;
}

/**
 * The brief as one string, for the key that decides which line is which.
 *
 * Two cakes described differently are two cakes, however alike the rest of the
 * line looks, so this goes into `cartLineKey` alongside the flavour and the
 * extras. A line with no brief contributes an empty string and keeps the key it
 * has always had.
 */
export function briefKey(brief: CartBrief | null | undefined): string {
	const clean = normaliseBrief(brief);
	if (!clean) return "";
	// The separators are characters a note can contain, so this is an identity
	// rather than a parseable encoding. It only ever has to distinguish.
	//
	// Every field `place_order` groups by is in here, in the same normalised
	// form, which is the whole agreement: the browser and the database have to
	// fold the same lines together and keep the same ones apart, or the total on
	// the order page is not the total that gets charged.
	return JSON.stringify([
		clean.note ?? "",
		clean.inspirationUrl ?? "",
		clean.photoIds ?? [],
		clean.customFlavour ?? "",
		clean.frosting ?? "",
		clean.frostingMatchesFlavour ?? false,
	]);
}

/** Every photo this brief names. Empty for the briefs that are only words. */
export function briefPhotoIds(brief: CartBrief | null | undefined): string[] {
	return normaliseBrief(brief)?.photoIds ?? [];
}

/** True when there is genuinely nothing to show for this brief. */
export function isEmptyBrief(brief: CartBrief | null | undefined): boolean {
	return normaliseBrief(brief) === undefined;
}
