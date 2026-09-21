"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { submitFeedback } from "@/app/(site)/order/[token]/feedback/actions";
import { EMPTY_FORM_STATE, errorFrom, fieldErrorsFrom, succeeded } from "@/lib/action-state";
import type { FormState } from "@/lib/action-state";
import type { Feedback } from "@/lib/types";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Checkbox, Field, FormError, Input, Textarea } from "@/components/ui/Form";
import { Notice } from "@/components/ui/Notice";
import { StarRating } from "./StarRating";

/**
 * Two boxes, a tick box, and a star per thing they bought.
 *
 * Deliberately the shortest form on the site. It is opened from an email a day
 * after someone collected a cake, by a person doing the shop a favour, so every
 * field that is not the favour itself has been left out: no categories, no
 * "how did you hear about us".
 *
 * The stars are the one thing that came back, and they are the exception that
 * proves the rule rather than a change of mind about it. They are optional,
 * every one of them, they sit under the words rather than above them, and the
 * form sends perfectly well with none of them touched. What earns them the
 * space is that a rating of a product is the only thing that puts stars beside
 * that product in a search result, and a rating of the shop by the shop is
 * explicitly ineligible for that. See the migration.
 *
 * The consent box is unticked by default and says in full what ticking it
 * means. It governs the words only: a star folded into an average is neither a
 * quote nor a name, so it counts either way, which the copy below says out
 * loud rather than leaving to be discovered.
 */
export function FeedbackForm({
	token,
	/** The name on the order, which is only a starting point. See the hint. */
	defaultAuthor,
	/** What they sent last time, when they have been here before. */
	existing,
	/**
	 * What was in the order, deduplicated by product: one opinion of the cake,
	 * however many lines of it the basket held. Empty for an order whose
	 * products have all since been withdrawn, which hides the whole section.
	 */
	rateable,
	/** What they gave each product last time, keyed by product id. */
	existingRatings,
}: {
	token: string;
	defaultAuthor: string;
	existing: Feedback | null;
	rateable: ReadonlyArray<{ productId: string; name: string }>;
	existingRatings: Readonly<Record<string, number>>;
}) {
	// Sent with the submission so the server can refuse a form that was filled in
	// faster than a person can type. Read from a ref rather than state because
	// nothing on screen depends on it.
	const openedAt = useRef(0);
	useEffect(() => {
		openedAt.current = Date.now();
	}, []);

	const [state, formAction, pending] = useActionState(
		async (previous: FormState, formData: FormData) => {
			formData.set("startedAt", String(openedAt.current));
			return submitFeedback(previous, formData);
		},
		EMPTY_FORM_STATE,
	);

	const errors = fieldErrorsFrom(state);
	const error = errorFrom(state);

	if (succeeded(state)) {
		return (
			<div className="flex flex-col gap-6">
				<div className="flex flex-col gap-3">
					<h2 className="font-display text-2xl">Thank you, that means a lot</h2>
					<p className="text-cocoa-soft text-sm">
						It&rsquo;s with me. If you said I could put it on the website, I&rsquo;ll read it
						properly before anything goes up.
					</p>
				</div>
				<div className="flex flex-wrap gap-3">
					<ButtonLink href={`/order/${token}`}>Back to your order</ButtonLink>
					<ButtonLink
						href="/shop"
						variant="secondary">
						Back to the shop
					</ButtonLink>
				</div>
			</div>
		);
	}

	return (
		<form
			action={formAction}
			className="relative flex flex-col gap-6">
			<input
				type="hidden"
				name="token"
				value={token}
			/>

			{/* Honeypot. Off-screen rather than display:none, which some bots skip. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden">
				<label htmlFor="website">Leave this empty</label>
				<input
					id="website"
					name="website"
					type="text"
					tabIndex={-1}
					autoComplete="off"
					defaultValue=""
				/>
			</div>

			{existing ? (
				<Notice>
					You&rsquo;ve already sent this one. Sending it again replaces what&rsquo;s there, so
					change whatever you like.
				</Notice>
			) : null}

			<Field
				label="Your name"
				required
				hint="However you’d like to be known. If you say I can put this on the website, this is the name that goes under it."
				error={errors.author}>
				{(props) => (
					<Input
						{...props}
						name="author"
						maxLength={80}
						autoComplete="name"
						defaultValue={existing?.author ?? defaultAuthor}
						invalid={Boolean(errors.author)}
					/>
				)}
			</Field>

			<Field
				label="How was it?"
				required
				hint="Anything at all. What you ordered, how it went down, what I could do better."
				error={errors.body}>
				{(props) => (
					<Textarea
						{...props}
						name="body"
						rows={6}
						maxLength={800}
						defaultValue={existing?.body ?? ""}
						invalid={Boolean(errors.body)}
					/>
				)}
			</Field>

			{rateable.length > 0 ? (
				<fieldset className="border-line flex flex-col gap-3 rounded-lg border p-4">
					<legend className="px-1 text-sm font-medium">
						{rateable.length === 1 ? "How was it, out of five?" : "How were they, out of five?"}
					</legend>
					<p className="text-cocoa-soft -mt-1 text-xs">
						Optional, and you can leave any of them blank. Ratings are only ever shown as an
						average, never with your name or what you wrote.
					</p>
					<div className="flex flex-col gap-2">
						{rateable.map((item) => (
							<StarRating
								key={item.productId}
								name={`rating:${item.productId}`}
								label={item.name}
								defaultValue={existingRatings[item.productId] ?? null}
							/>
						))}
					</div>
				</fieldset>
			) : null}

			<div className="border-line flex flex-col gap-2 rounded-lg border p-4">
				<Checkbox
					name="consented"
					label="You can put this on the website"
					defaultChecked={existing?.consented ?? false}
				/>
				<p className="text-cocoa-soft text-xs">
					Leave it unticked and what you&rsquo;ve written stays between us. Tick it and I may quote
					it on the site, with the name above and nothing else. Never your email address, your phone
					number or what you ordered.
				</p>
			</div>

			<FormError>{error}</FormError>

			<div className="flex flex-wrap items-center gap-4">
				<Button
					type="submit"
					size="lg"
					disabled={pending}>
					{pending ? "Sending…" : "Send it"}
				</Button>
				<Link
					href={`/order/${token}`}
					className="text-cocoa-soft hover:text-cocoa text-sm underline underline-offset-4">
					Not now
				</Link>
			</div>
		</form>
	);
}
