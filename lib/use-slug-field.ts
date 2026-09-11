"use client";

import { useState } from "react";
import { slugify } from "./validation";

/**
 * A name and the web address derived from it, as the product and category forms
 * both want it.
 *
 * The slug auto-fills from the name only while it has never been edited by
 * hand, and never at all for something that already exists: changing the slug of
 * a live product or category breaks every link to it that is already out in the
 * world, so an existing record starts out "touched" and is left alone.
 */
export function useSlugField(existing: { name: string; slug: string } | null): {
	name: string;
	setName: (value: string) => void;
	/** What the slug input shows: the typed value, or one derived from the name. */
	slug: string;
	setSlug: (value: string) => void;
} {
	const [name, setName] = useState(existing?.name ?? "");
	const [slug, setSlug] = useState(existing?.slug ?? "");
	const [touched, setTouched] = useState(Boolean(existing));

	return {
		name,
		setName,
		slug: touched ? slug : slugify(name),
		setSlug: (value: string) => {
			setTouched(true);
			setSlug(slugify(value));
		},
	};
}
