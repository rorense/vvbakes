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
 * The replacement needs both backslashes. With one, TypeScript reads the escape
 * itself and the string is already the single character "<", so the call
 * replaces "<" with "<" and does nothing at all. With two, the string is the six
 * characters backslash, u, 0, 0, 3, c, which is what a JSON string wants.
 * (Spelled out rather than written as the escape, because editors and tools
 * have resolved the escape in this comment into a literal "<" before.)
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
