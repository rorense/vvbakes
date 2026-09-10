"use client";

import { useActionState, useState } from "react";
import {
	resendEmail,
	saveInternalNotes,
	setOrderStatus,
} from "@/app/admin/(dashboard)/orders/actions";
import { EMPTY_FORM_STATE, errorFrom, succeeded } from "@/lib/action-state";
import { TRANSITION_EFFECTS, TRANSITION_LABELS } from "@/lib/order-status";
import type { OrderStatus } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { FormError, FormSuccess, Textarea } from "@/components/ui/Form";
import { AdminCard } from "./AdminShell";

/**
 * Moving an order along, plus the owner's private notes.
 *
 * Each transition says what it will do to the customer before it is pressed —
 * "confirm" sends bank details, "cancel" sends an apology — because these
 * buttons send real email to a real person and there is no undo.
 */
export function OrderActions({
	orderId,
	status,
	transitions,
	internalNotes,
}: {
	orderId: string;
	status: OrderStatus;
	transitions: OrderStatus[];
	internalNotes: string | null;
}) {
	const [state, action, pending] = useActionState(setOrderStatus, EMPTY_FORM_STATE);
	const [confirming, setConfirming] = useState<OrderStatus | null>(null);
	const error = errorFrom(state);

	return (
		<div className="flex flex-col gap-6">
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
						<div className="flex flex-wrap gap-3">
							{transitions.map((next) => (
								<Button
									key={next}
									variant={next === "cancelled" ? "secondary" : "primary"}
									onClick={() => setConfirming(next)}>
									{TRANSITION_LABELS[next]}
								</Button>
							))}
						</div>
						<ul className="text-cocoa-soft flex flex-col gap-1 text-xs">
							{transitions.map((next) => (
								<li key={next}>
									<strong className="font-medium">{TRANSITION_LABELS[next]}</strong> —{" "}
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
