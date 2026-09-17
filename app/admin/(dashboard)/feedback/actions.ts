"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * What the owner can do with feedback: put it up, or throw it away.
 *
 * Both start with `requireAdmin()` and then write through the request's own
 * session, so row level security is a second, independent check: the same
 * arrangement as every other admin mutation.
 *
 * These throw rather than returning a result. The list is a set of buttons
 * rather than a form, and `useToastedTransition` in the row turns a thrown
 * error into a message on screen.
 */

/**
 * Copies one piece of feedback onto the website.
 *
 * A copy, deliberately, and not a link. `reviews` is the list she edits in
 * settings, and saving settings replaces every row in it wholesale, so a
 * foreign key from here would be dangling within a week. What is kept instead
 * is `published_at`: a record that she made the decision, which is what stops
 * the same words going up twice.
 *
 * So taking it back down is done in settings, where the reviews live. The row
 * says so.
 */
export async function publishFeedback(id: string): Promise<void> {
	await requireAdmin();
	const supabase = await createClient();

	const { data: feedback, error: readError } = await supabase
		.from("feedback")
		.select("*")
		.eq("id", id)
		.maybeSingle();

	if (readError || !feedback) throw new Error("That feedback no longer exists.");

	// The second half of the promise made on the form. The button is not shown
	// without consent, but the button is not what enforces it.
	if (!feedback.consented) {
		throw new Error("They didn't agree to this one being shown.");
	}

	if (feedback.published_at) return;

	// Onto the end of the list, which is where a new one belongs: the order is
	// hers to set, in settings, and arriving at the top would rearrange a page
	// she has already arranged.
	const { data: last } = await supabase
		.from("reviews")
		.select("sort_order")
		.order("sort_order", { ascending: false })
		.limit(1)
		.maybeSingle();

	const { error: insertError } = await supabase.from("reviews").insert({
		author: feedback.author,
		body: feedback.body,
		// The line under the name ("Wedding cake, March") is hers to write, and
		// nothing the customer typed is it. Left empty for her to fill in.
		detail: null,
		sort_order: (last?.sort_order ?? 0) + 1,
	});

	if (insertError) throw new Error("That couldn't be put on the website.");

	const { error: stampError } = await supabase
		.from("feedback")
		.update({ published_at: new Date().toISOString() })
		.eq("id", id);

	if (stampError) {
		// The review is up. Saying nothing would be worse than saying this: the
		// button would still read "put it on the website" and a second press
		// would put the same words up twice.
		throw new Error(
			"It's on the website, but this page didn't record that. Reload before retrying.",
		);
	}

	// The reviews band is on the home page and nowhere else.
	revalidatePath("/");
	revalidatePath("/admin/feedback");
}

/**
 * Throws one piece of feedback away.
 *
 * Does not touch the website. If it was published, the review is a separate row
 * by now and stays where it is until she removes it in settings, which is also
 * what the row warns before this is pressed.
 */
export async function deleteFeedback(id: string): Promise<void> {
	await requireAdmin();
	const supabase = await createClient();

	const { error } = await supabase.from("feedback").delete().eq("id", id);
	if (error) throw new Error("That couldn't be deleted.");

	revalidatePath("/admin/feedback");
}
