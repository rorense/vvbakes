"use client";

import { useActionState, useState } from "react";
import { saveSettings } from "@/app/admin/(dashboard)/actions";
import { EMPTY_FORM_STATE, errorFrom, fieldErrorsFrom, succeeded } from "@/lib/action-state";
import type { Faq, PrivateSettings, SiteSettings } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, FormError, FormSuccess, Input, Switch, Textarea } from "@/components/ui/Form";
import { AdminCard, ReorderButtons } from "./AdminShell";

export function SettingsForm({
	settings,
	privateSettings,
	faqs,
	emailConfigured,
}: {
	settings: SiteSettings;
	privateSettings: PrivateSettings;
	faqs: Faq[];
	emailConfigured: boolean;
}) {
	const [state, action, pending] = useActionState(saveSettings, EMPTY_FORM_STATE);
	const errors = fieldErrorsFrom(state);
	const error = errorFrom(state);

	const [ordersOpen, setOrdersOpen] = useState(settings.ordersOpen);
	const [deliveryEnabled, setDeliveryEnabled] = useState(settings.deliveryEnabled);
	const [faqRows, setFaqRows] = useState<FaqDraft[]>(() => toDrafts(faqs));

	// A pair with nothing in either box is someone who pressed "add" and changed
	// their mind, so it is dropped rather than failed. One with a question and no
	// answer is a real mistake and is left in for the server to complain about.
	// Zod reports these per row, as `faqs.1.answer`, and the rows submitted are
	// not the rows on screen once the blank ones have been dropped. So the index
	// is deliberately thrown away and the list carries one message, which is why
	// those messages are written to make sense without it.
	const faqError =
		errors.faqs ?? Object.entries(errors).find(([key]) => key.startsWith("faqs."))?.[1];

	const faqsJson = JSON.stringify(
		faqRows
			.map((row) => ({ question: row.question.trim(), answer: row.answer.trim() }))
			.filter((row) => row.question !== "" || row.answer !== ""),
	);

	return (
		<form
			action={action}
			className="flex flex-col gap-6">
			<AdminCard title="Your shop">
				<div className="grid gap-5 sm:grid-cols-2">
					<Field
						label="Business name"
						required
						error={errors.businessName}>
						{(props) => (
							<Input
								{...props}
								name="businessName"
								defaultValue={settings.businessName}
							/>
						)}
					</Field>

					<Field
						label="Tagline"
						required
						error={errors.tagline}>
						{(props) => (
							<Input
								{...props}
								name="tagline"
								defaultValue={settings.tagline}
							/>
						)}
					</Field>

					<Field
						label="A note from the baker"
						hint="Shown on the home page. A few sentences in your own voice."
						error={errors.aboutText}
						className="sm:col-span-2">
						{(props) => (
							<Textarea
								{...props}
								name="aboutText"
								rows={4}
								defaultValue={settings.aboutText ?? ""}
							/>
						)}
					</Field>
				</div>
			</AdminCard>

			<AdminCard title="Taking orders">
				<div className="flex flex-col gap-5">
					<Switch
						name="ordersOpen"
						label="Open for orders"
						description="Turn off to show a message instead of the order form."
						checked={ordersOpen}
						onChange={(event) => setOrdersOpen(event.target.checked)}
					/>

					{!ordersOpen ? (
						<Field
							label="Message while closed"
							hint="What customers see instead of the form."
							error={errors.ordersClosedMessage}>
							{(props) => (
								<Textarea
									{...props}
									name="ordersClosedMessage"
									rows={2}
									defaultValue={settings.ordersClosedMessage ?? ""}
									placeholder="Back after the school holidays. Follow along on Instagram."
								/>
							)}
						</Field>
					) : (
						<input
							type="hidden"
							name="ordersClosedMessage"
							value={settings.ordersClosedMessage ?? ""}
						/>
					)}

					<div className="grid gap-5 sm:grid-cols-3">
						<Field
							label="Days notice needed"
							hint="0 means same-day orders are fine."
							required
							error={errors.leadTimeDays}>
							{(props) => (
								<Input
									{...props}
									name="leadTimeDays"
									inputMode="numeric"
									defaultValue={settings.leadTimeDays}
								/>
							)}
						</Field>

						<Field
							label="Daily cut-off"
							hint="After this, the earliest date moves out by a day."
							required
							error={errors.cutoffTime}>
							{(props) => (
								<Input
									{...props}
									name="cutoffTime"
									type="time"
									defaultValue={settings.cutoffTime.slice(0, 5)}
								/>
							)}
						</Field>

						<Field
							label="Book up to (days ahead)"
							required
							error={errors.bookingWindowDays}>
							{(props) => (
								<Input
									{...props}
									name="bookingWindowDays"
									inputMode="numeric"
									defaultValue={settings.bookingWindowDays}
								/>
							)}
						</Field>
					</div>

					<Field
						label="Timezone"
						hint="Used for every date and the daily cut-off. Leave this unless you move."
						required
						error={errors.timezone}>
						{(props) => (
							<Input
								{...props}
								name="timezone"
								defaultValue={settings.timezone}
							/>
						)}
					</Field>
				</div>
			</AdminCard>

			<AdminCard title="Pickup">
				<div className="grid gap-5 sm:grid-cols-2">
					<Field
						label="Suburb or area"
						hint="Public. Shown on the site before an order is confirmed."
						error={errors.pickupSuburb}>
						{(props) => (
							<Input
								{...props}
								name="pickupSuburb"
								defaultValue={settings.pickupSuburb ?? ""}
								placeholder="Mt Roskill, Auckland"
							/>
						)}
					</Field>

					<Field
						label="Pickup times"
						hint="Public. e.g. Pickups 4–7pm."
						error={errors.pickupWindowText}>
						{(props) => (
							<Input
								{...props}
								name="pickupWindowText"
								defaultValue={settings.pickupWindowText ?? ""}
							/>
						)}
					</Field>

					<Field
						label="Full address"
						hint="Private. Only sent to a customer once their order is confirmed."
						error={errors.pickupAddress}
						className="sm:col-span-2">
						{(props) => (
							<Input
								{...props}
								name="pickupAddress"
								defaultValue={privateSettings.pickupAddress ?? ""}
								placeholder="12 Example Road, Mt Roskill, Auckland 1041"
							/>
						)}
					</Field>

					<Field
						label="Pickup instructions"
						hint="Private. Sent with the confirmation, e.g. where to park."
						error={errors.pickupInstructions}
						className="sm:col-span-2">
						{(props) => (
							<Textarea
								{...props}
								name="pickupInstructions"
								rows={2}
								defaultValue={settings.pickupInstructions ?? ""}
							/>
						)}
					</Field>
				</div>
			</AdminCard>

			<AdminCard title="Delivery">
				<div className="flex flex-col gap-5">
					<Switch
						name="deliveryEnabled"
						label="Offer delivery"
						description="Adds a delivery option and an address field to the order form."
						checked={deliveryEnabled}
						onChange={(event) => setDeliveryEnabled(event.target.checked)}
					/>

					<div className="grid gap-5 sm:grid-cols-2">
						<Field
							label="Delivery fee"
							hint="In dollars. Use 0 for free delivery."
							error={errors.deliveryFeeCents}>
							{(props) => (
								<Input
									{...props}
									name="deliveryFee"
									inputMode="decimal"
									defaultValue={(settings.deliveryFeeCents / 100).toString()}
									disabled={!deliveryEnabled}
								/>
							)}
						</Field>

						<Field
							label="Where you deliver"
							hint="Shown next to the delivery option."
							error={errors.deliveryAreaText}>
							{(props) => (
								<Input
									{...props}
									name="deliveryAreaText"
									defaultValue={settings.deliveryAreaText ?? ""}
									placeholder="Within 10km of Mt Roskill"
									disabled={!deliveryEnabled}
								/>
							)}
						</Field>
					</div>
				</div>
			</AdminCard>

			<AdminCard title="Questions">
				<p className="text-cocoa-soft mb-5 text-sm">
					Answered on the home page, under &ldquo;The ones I get asked most&rdquo;. Remove them all
					and the section disappears from the site.
				</p>

				<input
					type="hidden"
					name="faqs"
					value={faqsJson}
				/>

				<FaqFieldset
					faqs={faqRows}
					setFaqs={setFaqRows}
					error={faqError}
				/>
			</AdminCard>

			<AdminCard title="Getting in touch">
				<div className="grid gap-5 sm:grid-cols-2">
					<Field
						label="Contact email"
						hint="Public. Customer emails reply to this."
						error={errors.contactEmail}>
						{(props) => (
							<Input
								{...props}
								name="contactEmail"
								type="email"
								defaultValue={settings.contactEmail ?? ""}
							/>
						)}
					</Field>

					<Field
						label="Contact phone"
						hint="Public. Leave blank if you'd rather not."
						error={errors.contactPhone}>
						{(props) => (
							<Input
								{...props}
								name="contactPhone"
								type="tel"
								defaultValue={settings.contactPhone ?? ""}
							/>
						)}
					</Field>

					<Field
						label="Instagram handle"
						required
						error={errors.instagramHandle}>
						{(props) => (
							<Input
								{...props}
								name="instagramHandle"
								defaultValue={settings.instagramHandle}
							/>
						)}
					</Field>

					<Field
						label="Send new orders to"
						hint="Private. Where you get told about a new order."
						error={errors.notificationEmail}>
						{(props) => (
							<Input
								{...props}
								name="notificationEmail"
								type="email"
								defaultValue={privateSettings.notificationEmail ?? ""}
							/>
						)}
					</Field>
				</div>

				{!emailConfigured ? (
					<p className="border-danger bg-danger-tint text-danger mt-5 rounded-md border px-4 py-3 text-sm">
						Email isn&rsquo;t configured on the server yet, so nothing is being sent. See the SMTP
						settings in the README.
					</p>
				) : null}
			</AdminCard>

			<AdminCard title="Bank details">
				<p className="text-cocoa-soft mb-5 text-sm">
					These are private. They are only ever sent in the confirmation email and shown on a
					customer&rsquo;s own order page once you&rsquo;ve confirmed it. Never on the public site.
				</p>
				<div className="grid gap-5 sm:grid-cols-2">
					<Field
						label="Account name"
						error={errors.bankAccountName}>
						{(props) => (
							<Input
								{...props}
								name="bankAccountName"
								defaultValue={privateSettings.bankAccountName ?? ""}
							/>
						)}
					</Field>

					<Field
						label="Account number"
						error={errors.bankAccountNumber}>
						{(props) => (
							<Input
								{...props}
								name="bankAccountNumber"
								inputMode="numeric"
								defaultValue={privateSettings.bankAccountNumber ?? ""}
								placeholder="12-3456-7890123-00"
							/>
						)}
					</Field>
				</div>
			</AdminCard>

			{error ? <FormError>{error}</FormError> : null}
			{succeeded(state) ? <FormSuccess>Settings saved.</FormSuccess> : null}

			<div>
				<Button
					type="submit"
					size="lg"
					disabled={pending}>
					{pending ? "Saving…" : "Save settings"}
				</Button>
			</div>
		</form>
	);
}

interface FaqDraft {
	key: string;
	question: string;
	answer: string;
}

function toDrafts(faqs: Faq[]): FaqDraft[] {
	return faqs.map((faq) => ({ key: faq.id, question: faq.question, answer: faq.answer }));
}

/**
 * The home page's questions, edited in place and submitted as one JSON field.
 *
 * The order of the list is the order on the page, so the arrows are the whole
 * ordering story: there is no sort number to keep in step, and no saved row to
 * match on, because a save replaces the list outright.
 */
function FaqFieldset({
	faqs,
	setFaqs,
	error,
}: {
	faqs: FaqDraft[];
	setFaqs: (next: FaqDraft[]) => void;
	error?: string;
}) {
	const update = (index: number, patch: Partial<FaqDraft>) => {
		const next = [...faqs];
		next[index] = { ...next[index]!, ...patch };
		setFaqs(next);
	};

	const move = (index: number, direction: -1 | 1) => {
		const to = index + direction;
		if (to < 0 || to >= faqs.length) return;
		const next = [...faqs];
		[next[index], next[to]] = [next[to]!, next[index]!];
		setFaqs(next);
	};

	return (
		<fieldset className="flex flex-col gap-3">
			<legend className="sr-only">Questions</legend>

			{faqs.map((faq, index) => (
				<div
					key={faq.key}
					className="border-line flex flex-col gap-3 rounded-md border p-3">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
						<label className="flex flex-1 flex-col gap-1">
							<span className="text-cocoa-soft text-xs">Question</span>
							<Input
								value={faq.question}
								placeholder={index === 0 ? "Do you do gluten free?" : ""}
								onChange={(event) => update(index, { question: event.target.value })}
							/>
						</label>

						<div className="flex items-center justify-end gap-3">
							<ReorderButtons
								label={faq.question || `question ${index + 1}`}
								layout="row"
								isFirst={index === 0}
								isLast={index === faqs.length - 1}
								onMove={(direction) => move(index, direction === "up" ? -1 : 1)}
							/>

							<button
								type="button"
								onClick={() => setFaqs(faqs.filter((_, i) => i !== index))}
								className="border-line hover:border-danger hover:text-danger min-h-11 rounded-md border px-3 text-sm">
								Remove
							</button>
						</div>
					</div>

					<label className="flex flex-col gap-1">
						<span className="text-cocoa-soft text-xs">Answer</span>
						<Textarea
							rows={3}
							value={faq.answer}
							onChange={(event) => update(index, { answer: event.target.value })}
						/>
					</label>
				</div>
			))}

			{error ? <p className="text-danger text-xs font-medium">{error}</p> : null}

			{faqs.length < 20 ? (
				<button
					type="button"
					onClick={() => setFaqs([...faqs, { key: `new-${Date.now()}`, question: "", answer: "" }])}
					className="border-line hover:border-cocoa rounded-pill w-fit border px-4 py-2 text-sm font-medium">
					Add {faqs.length === 0 ? "a question" : "another question"}
				</button>
			) : null}
		</fieldset>
	);
}
