"use client";

import { useActionState, useState } from "react";
import {
	resendEmail,
	saveInternalNotes,
	saveQuote,
	setOrderStatus,
} from "@/app/admin/(dashboard)/orders/actions";
import { EMPTY_FORM_STATE, errorFrom, fieldErrorsFrom, succeeded } from "@/lib/action-state";
import { TRANSITION_EFFECTS, TRANSITION_LABELS } from "@/lib/order-status";
import type { OrderStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, FormError, FormSuccess, Input, Textarea } from "@/components/ui/Form";
import { AdminCard } from "./AdminShell";

/**
 * Moving an order along, plus the owner's private notes.
 *
 * Each transition says what it will do to the customer before it is pressed,
 * "confirm" sends bank details, "cancel" sends an apology, because these
 * buttons send real email to a real person and there is no undo.
 */
export function OrderActions({
	orderId,
	status,
	transitions,
	internalNotes,
	customRequest,
	inspiration,
	needsQuote,
	quoteCents,
	totalCents,
}: {
	orderId: string;
	status: OrderStatus;
	transitions: OrderStatus[];
	internalNotes: string | null;
	customRequest: string | null;
	/**
	 * The customer's photos and link, rendered on the server and passed in so
	 * that this bundle does not have to carry the URL checks with it. Null when
	 * they sent nothing.
	 */
	inspiration: React.ReactNode;
	/**
	 * True when a line on this order was placed with no price on it — a custom
	 * cake, or anything else she marked "price on request".
	 *
	 * Not the same question as "does the total read zero". A custom cake
	 * alongside $24 of cupcakes leaves a total that is real, is not nothing, and
	 * is still missing the cake.
	 */
	needsQuote: boolean;
	quoteCents: number;
	totalCents: number;
}) {
	const [state, action, pending] = useActionState(setOrderStatus, EMPTY_FORM_STATE);
	const [confirming, setConfirming] = useState<OrderStatus | null>(null);
	const error = errorFrom(state);

	// Custom work arrives unpriced. Confirming it would email the customer bank
	// details and a total that leaves the cake out, so the price comes first.
	// An order that somehow totals nothing at all is held back for the same
	// reason, whatever it was made of.
	const needsPrice = (needsQuote && quoteCents === 0) || totalCents === 0;

	return (
		<div className="flex flex-col gap-6">
			{/* A photo with no words is a brief too, so the card appears for that.
			    So does a line she has to price, whether or not they typed anything:
			    without it there would be nowhere to put the number. */}
			{needsQuote || customRequest || inspiration ? (
				<QuoteCard
					orderId={orderId}
					customRequest={customRequest}
					inspiration={inspiration}
					quoteCents={quoteCents}
					needsPrice={needsPrice}
				/>
			) : null}

			<AdminCard title="What happens next">
				{transitions.length === 0 ? (
					<p className="text-cocoa-soft text-sm">
						This order is {status}. There is nothing left to do.
					</p>
				) : confirming ? (
					<form
						action={action}
						className="flex flex-col gap-4">
						<input
							type="hidden"
							name="id"
							value={orderId}
						/>
						<input
							type="hidden"
							name="status"
							value={confirming}
						/>

						<p className="text-sm font-medium">{TRANSITION_LABELS[confirming]}?</p>
						<p className="text-cocoa-soft text-sm">{TRANSITION_EFFECTS[confirming]}</p>

						{confirming === "cancelled" ? (
							<label className="flex flex-col gap-2">
								<span className="text-sm font-medium">
									Reason{" "}
									<span className="text-cocoa-soft text-xs font-normal">
										(optional, included in the email)
									</span>
								</span>
								<Textarea
									name="reason"
									rows={2}
									placeholder="e.g. I'm unwell and can't bake that weekend."
								/>
							</label>
						) : null}

						<div className="flex flex-wrap items-center gap-3">
							<Button
								type="submit"
								variant={confirming === "cancelled" ? "danger" : "primary"}
								disabled={pending}>
								{pending ? "Working…" : `Yes, ${TRANSITION_LABELS[confirming].toLowerCase()}`}
							</Button>
							<button
								type="button"
								onClick={() => setConfirming(null)}
								className="text-cocoa-soft hover:text-cocoa text-sm underline underline-offset-4">
								Never mind
							</button>
						</div>
					</form>
				) : (
					<div className="flex flex-col gap-4">
						{needsPrice && transitions.includes("confirmed") ? (
							<p className="border-line bg-paper-deep rounded-md border px-4 py-3 text-sm">
								This one has no price on it yet, so it cannot be confirmed. Set one above first.
							</p>
						) : null}

						<div className="flex flex-wrap gap-3">
							{transitions.map((next) => (
								<Button
									key={next}
									variant={next === "cancelled" ? "secondary" : "primary"}
									disabled={next === "confirmed" && needsPrice}
									onClick={() => setConfirming(next)}>
									{TRANSITION_LABELS[next]}
								</Button>
							))}
						</div>
						<ul className="text-cocoa-soft flex flex-col gap-1 text-xs">
							{transitions.map((next) => (
								<li key={next}>
									<strong className="font-medium">{TRANSITION_LABELS[next]}</strong>:{" "}
									{TRANSITION_EFFECTS[next]}
								</li>
							))}
						</ul>
					</div>
				)}

				{error ? <FormError>{error}</FormError> : null}

				<ResendEmail orderId={orderId} />
			</AdminCard>

			<InternalNotes
				orderId={orderId}
				value={internalNotes}
			/>
		</div>
	);
}

function ResendEmail({ orderId }: { orderId: string }) {
	const [state, action, pending] = useActionState(resendEmail, EMPTY_FORM_STATE);
	const error = errorFrom(state);

	return (
		<form
			action={action}
			className="border-line mt-5 flex flex-col gap-2 border-t pt-5">
			<input
				type="hidden"
				name="id"
				value={orderId}
			/>
			<button
				type="submit"
				disabled={pending}
				className="text-cocoa-soft hover:text-cocoa w-fit text-sm underline underline-offset-4 disabled:opacity-50">
				{pending ? "Sending…" : "Send the latest email again"}
			</button>
			{error ? <FormError>{error}</FormError> : null}
			{succeeded(state) ? <FormSuccess>Sent.</FormSuccess> : null}
		</form>
	);
}

function InternalNotes({ orderId, value }: { orderId: string; value: string | null }) {
	const [state, action, pending] = useActionState(saveInternalNotes, EMPTY_FORM_STATE);
	const error = errorFrom(state);

	return (
		<AdminCard title="Your notes">
			<form
				action={action}
				className="flex flex-col gap-4">
				<input
					type="hidden"
					name="id"
					value={orderId}
				/>
				<Textarea
					name="internalNotes"
					rows={3}
					defaultValue={value ?? ""}
					placeholder="Only you can see this. Paid on the 12th, wants it boxed separately…"
					aria-label="Private notes about this order"
				/>
				<div className="flex items-center gap-3">
					<Button
						type="submit"
						variant="secondary"
						disabled={pending}>
						{pending ? "Saving…" : "Save notes"}
					</Button>
					{succeeded(state) ? (
						<span
							role="status"
							className="text-cocoa-soft text-sm">
							Saved.
						</span>
					) : null}
				</div>
				{error ? <FormError>{error}</FormError> : null}
			</form>
		</AdminCard>
	);
}

/**
 * The custom request and the price the owner puts on it.
 *
 * Sits above the status buttons because it has to happen first: the request is
 * the only description of what she is being asked to make, and until there is a
 * price the order cannot be confirmed.
 */
function QuoteCard({
	orderId,
	customRequest,
	inspiration,
	quoteCents,
	needsPrice,
}: {
	orderId: string;
	customRequest: string | null;
	inspiration: React.ReactNode;
	quoteCents: number;
	needsPrice: boolean;
}) {
	const [state, action, pending] = useActionState(saveQuote, EMPTY_FORM_STATE);
	const errors = fieldErrorsFrom(state);
	const error = errorFrom(state);

	return (
		<AdminCard
			title="The cake they asked for"
			className={needsPrice ? "border-cocoa" : undefined}>
			{customRequest ? (
				<p className="mb-5 text-sm whitespace-pre-wrap">{customRequest}</p>
			) : (
				<p className="text-cocoa-soft mb-5 text-sm">
					What they asked for is written against the line itself, down in Order.
				</p>
			)}

			{inspiration ? <div className="mb-5">{inspiration}</div> : null}

			<form
				action={action}
				className="border-line flex flex-col gap-4 border-t pt-5">
				<input
					type="hidden"
					name="id"
					value={orderId}
				/>

				<Field
					label="Price for this cake"
					hint="In dollars. Added to anything they also ordered off the menu."
					error={errors.quoteCents}>
					{(props) => (
						<Input
							{...props}
							name="quote"
							inputMode="decimal"
							defaultValue={quoteCents > 0 ? (quoteCents / 100).toString() : ""}
							placeholder="85"
							className="max-w-40"
						/>
					)}
				</Field>

				<div className="flex items-center gap-3">
					<Button
						type="submit"
						disabled={pending}>
						{pending ? "Saving…" : quoteCents > 0 ? "Update the price" : "Set the price"}
					</Button>
					{succeeded(state) ? (
						<span
							role="status"
							className="text-cocoa-soft text-sm">
							Saved.
						</span>
					) : null}
				</div>

				{error ? <FormError>{error}</FormError> : null}
			</form>
		</AdminCard>
	);
}
