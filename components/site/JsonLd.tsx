/**
 * One structured-data block, escaped once and correctly.
 *
 * Every JSON-LD script on this site is built from admin-editable text: product
 * names, a tagline, an FAQ answer. `JSON.stringify` escapes quotes but leaves
 * "<" alone, so a name holding a closing script tag would end the script early
 * and put the rest of the JSON into the document as markup. Replacing "<" with
 * its unicode escape closes that, and JSON parses the escape back to the same
 * character, so nothing downstream sees a difference.
 *
 * The replacement needs both backslashes. "<" in TypeScript source is
 * already the single character "<", so escaping with one backslash compiles to
 * a replace of "<" with "<" and does nothing at all. Two backslashes emit the
 * six characters <, which is what a JSON string wants.
 *
 * This lived in two files with a paragraph of that explanation each, and one of
 * the two had the single-backslash bug for a while. One copy is harder to get
 * half right.
 */
export function JsonLd({ data }: { data: unknown }) {
	if (!data) return null;

	return (
		<script
			type="application/ld+json"
			dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
		/>
	);
}
