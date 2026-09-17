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

/**
 * Two boxes and a tick box.
 *
 * Deliberately the shortest form on the site. It is opened from an email a day
 * after someone collected a cake, by a person doing the shop a favour, so every
 * field that is not the favour itself has been left out: no rating out of five,
 * no categories, no "how did you hear about us".
 *
 * The consent box is unticked by default and says in full what ticking it
 * means. Nothing here publishes anything either way; see the action.
 */
export function FeedbackForm({
	token,
	/** The name on the order, which is only a starting point. See the hint. */
	defaultAuthor,
	/** What they sent last time, when they have been here before. */
	existing,
}: {
	token: string;
	defaultAuthor: string;
	existing: Feedback | null;
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
