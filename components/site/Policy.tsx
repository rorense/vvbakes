/**
 * The two building blocks the policy pages are made of.
 *
 * Privacy and terms are the same kind of page — a stack of short clauses under
 * serif headings, separated by hairlines rather than numbered like a contract.
 * They lived twice before there was a second one; now they live here.
 */

/**
 * One clause of a policy.
 *
 * Hairlines and a serif heading rather than a wall of legal text: this is the
 * same printed-card language as every other page, because a policy nobody reads
 * is not a policy. The prose is deliberately plain for the same reason.
 */
export function Clause({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="border-line flex flex-col gap-3 border-t pt-8 first:border-t-0 first:pt-0">
			<h2 className="font-display text-2xl">{title}</h2>
			<div className="text-cocoa-soft flex flex-col gap-3">{children}</div>
		</section>
	);
}

/** A bulleted list, since preflight strips the markers and padding from `ul`. */
export function Points({ children }: { children: React.ReactNode }) {
	return <ul className="flex list-disc flex-col gap-1.5 pl-5">{children}</ul>;
}

/** Emphasis inside a clause, for the word a skimming eye should catch. */
export function Term({ children }: { children: React.ReactNode }) {
	return <strong className="text-cocoa font-medium">{children}</strong>;
}
