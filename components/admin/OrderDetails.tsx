"use client";

import { useActionState, useState } from "react";
import { saveOrderDetails } from "@/app/admin/(dashboard)/orders/actions";
import { EMPTY_FORM_STATE, errorFrom, fieldErrorsFrom } from "@/lib/action-state";
import { formatDateLongWithTime } from "@/lib/dates";
import type { Fulfilment } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/Form";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { Notice } from "@/components/ui/Notice";
import { useToastOnResult } from "@/components/ui/Toast";
import { AdminCard } from "./AdminShell";

/** The details a correction may touch, as the page hands them over. */
export interface OrderDetailsValues {
	pickupDate: string;
	/** "16:30:00" out of the column; the form works in "16:30". */
	pickupTime: string | null;
	fulfilment: Fulfilment;
	customerName: string;
	customerEmail: string;
	customerPhone: string;
	deliveryAddress: string | null;
	notes: string | null;
}

/**
 * Who the order is for, and the form that puts it right when it is wrong.
 *
 * Customers mistype. A pickup date a day out, a domain missing a letter, a
 * phone number a digit short, and until this existed the order carried that
 * mistake for ever, because the admin could only read these fields. So the card
 * reads as it always did, standing at the bench, and opens into a form when
 * something in it needs correcting.
 *
 * Reading is the common case by a long way, which is why the form is behind a
 * button rather than being the card: eight inputs are far worse to glance at
 * than eight lines of text, and glancing is nearly always what she is doing.
 */
export function OrderDetails({
	orderId,
	reference,
	values,
	deliveryEnabled,
	dateWarning,
	orderPageLink,
}: {
	orderId: string;
	/** Only for the subject line of the mail-to. */
	reference: string;
	values: OrderDetailsValues;
	/**
	 * Whether the shop offers delivery at all. It does not lock the choice, she
	 * may well agree to drop one off on a shop that has delivery switched off;
	 * it only decides whether the option is worth putting in front of her.
	 */
	deliveryEnabled: boolean;
	/**
	 * What is wrong with the date this order sits on, if anything: a day the
	 * shop is shut, or a day now carrying more orders than it can bake. Worked
	 * out on the server against the same rules the calendars use, and said
	 * rather than enforced, because she is the one who decides what can be baked.
	 */
	dateWarning: string | null;
	/** The customer's own order page, rendered on the server for its absolute URL. */
	orderPageLink: React.ReactNode;
}) {
	const [editing, setEditing] = useState(false);

	return (
		<AdminCard title="Customer">
			{editing ? (
				<DetailsForm
					orderId={orderId}
					values={values}
					deliveryEnabled={deliveryEnabled}
					onDone={() => setEditing(false)}
				/>
			) : (
				<>
					{dateWarning ? <Notice className="mb-4">{dateWarning}</Notice> : null}

					<HairlineList as="dl">
						<HairlineRow as="div">
							<dt className="text-cocoa-soft text-sm">Name</dt>
							<dd className="text-right text-sm font-medium">{values.customerName}</dd>
						</HairlineRow>
						<HairlineRow as="div">
							<dt className="text-cocoa-soft text-sm">Email</dt>
							<dd className="text-right text-sm font-medium">
								<a
									href={`mailto:${values.customerEmail}?subject=${encodeURIComponent(`Your vvbakes order ${reference}`)}`}
									className="underline underline-offset-2">
									{values.customerEmail}
								</a>
							</dd>
						</HairlineRow>
						<HairlineRow as="div">
							<dt className="text-cocoa-soft text-sm">Phone</dt>
							<dd className="text-right text-sm font-medium">
								<a
									href={`tel:${values.customerPhone.replace(/\s/g, "")}`}
									className="underline underline-offset-2">
									{values.customerPhone}
								</a>
							</dd>
						</HairlineRow>
						<HairlineRow as="div">
							<dt className="text-cocoa-soft text-sm">
								{values.fulfilment === "delivery" ? "Delivery" : "Pickup"}
							</dt>
							<dd className="text-right text-sm font-medium">
								{formatDateLongWithTime(values.pickupDate, values.pickupTime)}
							</dd>
						</HairlineRow>
						{values.deliveryAddress ? (
							<HairlineRow as="div">
								<dt className="text-cocoa-soft text-sm">Address</dt>
								<dd className="text-right text-sm font-medium">{values.deliveryAddress}</dd>
							</HairlineRow>
						) : null}
					</HairlineList>

					<div className="mt-5">
						<Button
							variant="secondary"
							onClick={() => setEditing(true)}>
							Correct these details
						</Button>
					</div>

					<p className="text-cocoa-soft mt-4 text-xs">{orderPageLink}</p>
				</>
			)}
		</AdminCard>
	);
}

/**
 * The correction itself.
 *
 * Every field starts at what the order already says, so opening the form and
 * saving it untouched changes nothing and writes nothing to the trail.
 * `fulfilment` is the one piece of state here, because the address box only
 * means anything under a delivery.
 */
function DetailsForm({
	orderId,
	values,
	deliveryEnabled,
	onDone,
}: {
	orderId: string;
	values: OrderDetailsValues;
	deliveryEnabled: boolean;
	onDone: () => void;
}) {
	const [state, action, pending] = useActionState(saveOrderDetails, EMPTY_FORM_STATE);
	const errors = fieldErrorsFrom(state);
	const error = errorFrom(state);
	const [fulfilment, setFulfilment] = useState<Fulfilment>(values.fulfilment);

	useToastOnResult(state, "Those details are saved.");

	// A save that lands puts the card back to reading, which is where she wants
	// to be the moment the correction is in. Adjusted during render rather than
	// in an effect, the way OrderActions clears its confirmation prompt: one
	// render to do it, not two.
	const [reported, setReported] = useState(state);
	if (reported !== state) {
		setReported(state);
		if (state.result?.ok) onDone();
	}

	return (
		<form
			action={action}
			className="flex flex-col gap-5">
			<input
				type="hidden"
				name="id"
				value={orderId}
			/>

			<p className="text-cocoa-soft text-sm">
				For fixing what a customer got wrong. Nothing here emails them, so once it is right, send
				the latest email again from the card above.
			</p>

			<div className="grid gap-5 sm:grid-cols-2">
				<Field
					label={fulfilment === "delivery" ? "Delivery date" : "Pickup date"}
					required
					error={errors.pickupDate}>
					{(props) => (
						<Input
							{...props}
							name="pickupDate"
							type="date"
							defaultValue={values.pickupDate}
							invalid={Boolean(errors.pickupDate)}
						/>
					)}
				</Field>

				<Field
					label={fulfilment === "delivery" ? "Delivery time" : "Pickup time"}
					hint="Blank means they did not say."
					error={errors.pickupTime}>
					{(props) => (
						<Input
							{...props}
							name="pickupTime"
							type="time"
							// The column carries seconds; a time input will not take them.
							defaultValue={values.pickupTime?.slice(0, 5) ?? ""}
						/>
					)}
				</Field>

				<Field
					label="Name"
					required
					error={errors.customerName}
					className="sm:col-span-2">
					{(props) => (
						<Input
							{...props}
							name="customerName"
							defaultValue={values.customerName}
							invalid={Boolean(errors.customerName)}
						/>
					)}
				</Field>

				<Field
					label="Email"
					required
					hint="Where every email about this order goes."
					error={errors.customerEmail}>
					{(props) => (
						<Input
							{...props}
							name="customerEmail"
							type="email"
							inputMode="email"
							defaultValue={values.customerEmail}
							invalid={Boolean(errors.customerEmail)}
						/>
					)}
				</Field>

				<Field
					label="Phone"
					required
					error={errors.customerPhone}>
					{(props) => (
						<Input
							{...props}
							name="customerPhone"
							type="tel"
							inputMode="tel"
							defaultValue={values.customerPhone}
							invalid={Boolean(errors.customerPhone)}
						/>
					)}
				</Field>

				{/* Offered when the shop offers delivery, and also when this order is
				    already one: an order taken as a delivery before she switched it
				    off must not lose the only control that could switch it back. */}
				{deliveryEnabled || values.fulfilment === "delivery" ? (
					<Field
						label="Pickup or delivery"
						required
						className="sm:col-span-2">
						{(props) => (
							<Select
								{...props}
								name="fulfilment"
								value={fulfilment}
								onChange={(event) => setFulfilment(event.target.value as Fulfilment)}
								className="sm:max-w-xs">
								<option value="pickup">Pick up</option>
								<option value="delivery">Delivery</option>
							</Select>
						)}
					</Field>
				) : (
					<input
						type="hidden"
						name="fulfilment"
						value={fulfilment}
					/>
				)}

				{fulfilment === "delivery" ? (
					<Field
						label="Delivery address"
						required
						error={errors.deliveryAddress}
						className="sm:col-span-2">
						{(props) => (
							<Textarea
								{...props}
								name="deliveryAddress"
								rows={3}
								defaultValue={values.deliveryAddress ?? ""}
								placeholder="Street, suburb, city"
								invalid={Boolean(errors.deliveryAddress)}
							/>
						)}
					</Field>
				) : (
					// Cleared rather than left out. A field the form does not submit
					// reads as an empty string at the other end anyway, and saying so
					// here is what makes "moved back to pickup" leave no address behind.
					<input
						type="hidden"
						name="deliveryAddress"
						value=""
					/>
				)}

				<Field
					label="Allergies and notes"
					hint="What the customer told you. Your own private notes have a card of their own."
					error={errors.notes}
					className="sm:col-span-2">
					{(props) => (
						<Textarea
							{...props}
							name="notes"
							rows={3}
							defaultValue={values.notes ?? ""}
							invalid={Boolean(errors.notes)}
						/>
					)}
				</Field>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<Button
					type="submit"
					disabled={pending}>
					{pending ? "Saving…" : "Save these details"}
				</Button>
				<button
					type="button"
					onClick={onDone}
					className="text-cocoa-soft hover:text-cocoa text-sm underline underline-offset-4">
					Never mind
				</button>
			</div>

			{error ? <FormError>{error}</FormError> : null}
		</form>
	);
}
