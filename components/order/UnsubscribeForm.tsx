"use client";

import Link from "next/link";
import { useActionState } from "react";
import { stopFeedbackEmails } from "@/app/(site)/unsubscribe/[token]/actions";
import { EMPTY_FORM_STATE, errorFrom, succeeded } from "@/lib/action-state";
import { Button, ButtonLink } from "@/components/ui/Button";
import { FormError } from "@/components/ui/Form";

/**
 * One button, and the sentence that says what it does.
 *
 * A button rather than a link that acts on sight. The address this sits at is
 * printed in an email, and mail scanners open every URL in an email with GET;
 * a page that unsubscribed on load would mute people who never read it. So
 * loading this changes nothing and the form posts.
 */
export function UnsubscribeForm({
	token,
	email,
	alreadyOff,
}: {
	token: string;
	/** Shown back to them, so it is obvious which address this is about. */
	email: string;
	/** They have been here before, or pressed the button in their mail client. */
	alreadyOff: boolean;
}) {
	const [state, formAction, pending] = useActionState(stopFeedbackEmails, EMPTY_FORM_STATE);
	const error = errorFrom(state);

	if (alreadyOff || succeeded(state)) {
		return (
			<div className="flex flex-col gap-6">
				<div className="flex flex-col gap-3">
					<h2 className="font-display text-2xl">
						{alreadyOff && !succeeded(state) ? "You're already off the list" : "Done"}
					</h2>
					<p className="text-cocoa-soft text-sm">
						I won&rsquo;t ask {email} how an order went again. If you order again you&rsquo;ll still
						get the emails about that order itself, because those are how you find out it&rsquo;s
						confirmed and when to collect it.
					</p>
					<p className="text-cocoa-soft text-sm">
						Changed your mind later? Just reply to any of my emails and I&rsquo;ll put you back.
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
			className="flex flex-col gap-6">
			<input
				type="hidden"
				name="token"
				value={token}
			/>

			<div className="border-line flex flex-col gap-2 rounded-lg border p-4">
				<p className="text-sm font-medium">This is about {email}</p>
				<p className="text-cocoa-soft text-xs">
					Stopping these means I won&rsquo;t ask you how an order went. You&rsquo;ll still get the
					emails about any order you place: the confirmation with the bank details, and the message
					on the day saying it&rsquo;s ready. Those are the order itself, so they keep coming.
				</p>
			</div>

			<FormError>{error}</FormError>

			<div className="flex flex-wrap items-center gap-4">
				<Button
					type="submit"
					size="lg"
					disabled={pending}>
					{pending ? "Just a moment…" : "Stop these emails"}
				</Button>
				<Link
					href={`/order/${token}`}
					className="text-cocoa-soft hover:text-cocoa text-sm underline underline-offset-4">
					Keep getting them
				</Link>
			</div>
		</form>
	);
}
