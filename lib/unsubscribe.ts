/**
 * What an unsubscribe *is*: the sentinel, the spelling of an address, and the
 * headers that carry the offer.
 *
 * Pure on purpose, and pointedly not `server-only`. The table lives next door
 * in lib/optouts.ts, which is server-only because it reaches for the service
 * role. Splitting them is not tidiness: `npm run emails:test` has to build the
 * very same headers to prove a mail client reads them, and a script run under
 * tsx cannot import anything that pulls in `server-only`. Keeping these three
 * out here is what lets the test send exercise the real function instead of a
 * copy of it that can drift.
 *
 * Nothing here suppresses an order email. See the migration for why that is a
 * rule rather than an oversight.
 */

/**
 * What `sendOrderEmail` reports when it refused rather than failed.
 *
 * A string the two callers compare on, so the job can count an opt-out apart
 * from a bounce. Those mean opposite things: a bounce is an address that should
 * be looked at, this is the system working.
 */
export const OPTED_OUT = "unsubscribed";

/**
 * One spelling of an address, so two spellings cannot become two rows.
 *
 * Case and surrounding space only. The local part of an address is
 * case-sensitive by the letter of RFC 5321, but no mail provider anyone uses
 * treats it that way, and the failure mode of respecting it here is that
 * somebody who unsubscribed as `Alex@` keeps getting email as `alex@`. The
 * database checks the result, so a caller that skips this is refused rather
 * than quietly writing a duplicate.
 */
export function normaliseEmail(email: string): string {
	return email.trim().toLowerCase();
}

/**
 * The headers that put an unsubscribe button in the mail client itself.
 *
 * RFC 8058. `List-Unsubscribe-Post` is what turns the header from "here is a
 * link" into a button Gmail and Outlook draw at the top of the message, and it
 * commits us to acting on a POST to the URL without asking anything further.
 * That is safe precisely because it is a POST: corporate link scanners open
 * every URL in a message with GET, and a GET here does nothing but show a page.
 *
 * The mailto is a fallback for clients that ignore the first, and is left out
 * when the shop has no contact address on file rather than printing a dead one.
 *
 * Only ever attached to the feedback request. Putting it on an order
 * confirmation would offer to stop an email we would go on sending anyway.
 */
export function unsubscribeHeaders(options: {
	siteUrl: string;
	token: string;
	contactEmail?: string | null;
}): Record<string, string> {
	const url = `${options.siteUrl}/api/unsubscribe/${options.token}`;
	const targets = [`<${url}>`];

	if (options.contactEmail) {
		targets.push(`<mailto:${options.contactEmail}?subject=Unsubscribe>`);
	}

	return {
		"List-Unsubscribe": targets.join(", "),
		"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
	};
}
