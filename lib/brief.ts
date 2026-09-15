import { MAX_INSPIRATION_PHOTOS } from "./constants";
import type { CartBrief } from "./types";

/**
 * What a customer said about one line: a note, a link, and some photos.
 *
 * Shared by the picker that writes one, the cart that stores it, and the order
 * form that sends it, so all three agree on when two briefs are the same brief
 * and on what an empty one looks like. The database checks the same lengths
 * again on the way in; these are here so a note typed into a textarea cannot
 * quietly fill the cart's storage quota before it ever gets that far.
 */

/** Matches the check constraint on `order_items.note`. */
export const MAX_BRIEF_NOTE = 1000;

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

	if (note === "" && inspirationUrl === "" && photoIds.length === 0) return undefined;

	const next: CartBrief = {};
	if (note !== "") next.note = note;
	if (inspirationUrl !== "") next.inspirationUrl = inspirationUrl;
	if (photoIds.length > 0) next.photoIds = photoIds;
	return next;
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
	return JSON.stringify([clean.note ?? "", clean.inspirationUrl ?? "", clean.photoIds ?? []]);
}

/** Every photo this brief names. Empty for the briefs that are only words. */
export function briefPhotoIds(brief: CartBrief | null | undefined): string[] {
	return normaliseBrief(brief)?.photoIds ?? [];
}

/** True when there is genuinely nothing to show for this brief. */
export function isEmptyBrief(brief: CartBrief | null | undefined): boolean {
	return normaliseBrief(brief) === undefined;
}
