"use client";

import { useActionState, useState } from "react";
import { saveSettings } from "@/app/admin/(dashboard)/actions";
import { EMPTY_FORM_STATE, errorFrom, fieldErrorsFrom, listErrorFrom } from "@/lib/action-state";
import type { Faq, PrivateSettings, Review, SiteSettings } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, FormError, Input, Switch, Textarea } from "@/components/ui/Form";
import { Notice } from "@/components/ui/Notice";
import { useToastOnResult } from "@/components/ui/Toast";
import { AdminCard } from "./AdminShell";
import { DraftList } from "./DraftList";

export function SettingsForm({
	settings,
	privateSettings,
	faqs,
	reviews,
	emailConfigured,
}: {
	settings: SiteSettings;
	privateSettings: PrivateSettings;
	faqs: Faq[];
	reviews: Review[];
	emailConfigured: boolean;
}) {
	const [state, action, pending] = useActionState(saveSettings, EMPTY_FORM_STATE);
	const errors = fieldErrorsFrom(state);
	const error = errorFrom(state);

	// This form is long enough that the button is usually off the top of the
	// screen by the time it is pressed, so the answer comes to the thumb.
	useToastOnResult(state, "Settings saved.");

	const [ordersOpen, setOrdersOpen] = useState(settings.ordersOpen);
	const [deliveryEnabled, setDeliveryEnabled] = useState(settings.deliveryEnabled);
	const [deliveryFeeOnRequest, setDeliveryFeeOnRequest] = useState(settings.deliveryFeeOnRequest);
	const [faqRows, setFaqRows] = useState<FaqDraft[]>(() => toFaqDrafts(faqs));
	const [reviewRows, setReviewRows] = useState<ReviewDraft[]>(() => toReviewDrafts(reviews));

	// A pair with nothing in either box is someone who pressed "add" and changed
	// their mind, so it is dropped rather than failed. One with a question and no
	// answer is a real mistake and is left in for the server to complain about.
	// See `listErrorFrom` for why the row index those failures carry is dropped.
	const faqError = listErrorFrom(errors, "faqs");
	const reviewError = listErrorFrom(errors, "reviews");

	const faqsJson = JSON.stringify(
		faqRows
			.map((row) => ({ question: row.question.trim(), answer: row.answer.trim() }))
			.filter((row) => row.question !== "" || row.answer !== ""),
	);

	const reviewsJson = JSON.stringify(
		reviewRows
			.map((row) => ({
				author: row.author.trim(),
				body: row.body.trim(),
				detail: row.detail.trim(),
			}))
			.filter((row) => row.author !== "" || row.body !== "" || row.detail !== ""),
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

					{/* Above the fee rather than beside it, because it decides whether
					    the fee box is a question at all. */}
					<Switch
						name="deliveryFeeOnRequest"
						label="I'll confirm the fee after the order"
						description="For a fee that depends on the address. Nothing is charged for delivery at checkout; the terms and the order form say you'll confirm it, and you add it to the quote when you reply."
						checked={deliveryFeeOnRequest}
						onChange={(event) => setDeliveryFeeOnRequest(event.target.checked)}
						disabled={!deliveryEnabled}
					/>

					<div className="grid gap-5 sm:grid-cols-2">
						<Field
							label="Delivery fee"
							hint={
								deliveryFeeOnRequest
									? "Not charged at checkout while you're confirming the fee by hand."
									: "In dollars. Use 0 for free delivery."
							}
							error={errors.deliveryFeeCents}>
							{(props) => (
								<Input
									{...props}
									name="deliveryFee"
									inputMode="decimal"
									defaultValue={(settings.deliveryFeeCents / 100).toString()}
									disabled={!deliveryEnabled || deliveryFeeOnRequest}
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

				<DraftList
					rows={faqRows}
					setRows={setFaqRows}
					legend="Questions"
					noun="question"
					error={faqError}
					blank={() => ({ key: `new-${Date.now()}`, question: "", answer: "" })}
					labelOf={(faq, index) => faq.question || `question ${index + 1}`}
					fields={(faq, index, update) => (
						<label className="flex flex-1 flex-col gap-1">
							<span className="text-cocoa-soft text-xs">Question</span>
							<Input
								value={faq.question}
								placeholder={index === 0 ? "Do you do gluten free?" : ""}
								onChange={(event) => update({ question: event.target.value })}
							/>
						</label>
					)}
					body={(faq, _index, update) => (
						<label className="flex flex-col gap-1">
							<span className="text-cocoa-soft text-xs">Answer</span>
							<Textarea
								rows={3}
								value={faq.answer}
								onChange={(event) => update({ answer: event.target.value })}
							/>
						</label>
					)}
				/>
			</AdminCard>

			{/* Named, because the feedback list links straight here: taking a
			    published review down is done in this card and nowhere else. */}
			<AdminCard
				id="reviews"
				title="Kind words">
				<p className="text-cocoa-soft mb-5 text-sm">
					Shown on the home page above &ldquo;How it works&rdquo;. Use the name the customer would
					be happy to see on a public page. No reviews, no section.
				</p>

				<input
					type="hidden"
					name="reviews"
					value={reviewsJson}
				/>

				<DraftList
					rows={reviewRows}
					setRows={setReviewRows}
					legend="Customer reviews"
					noun="review"
					error={reviewError}
					blank={() => ({ key: `new-${Date.now()}`, author: "", body: "", detail: "" })}
					labelOf={(review, index) => review.author || `review ${index + 1}`}
					fields={(review, index, update) => (
						<>
							<label className="flex flex-1 flex-col gap-1">
								<span className="text-cocoa-soft text-xs">Name</span>
								<Input
									value={review.author}
									onChange={(event) => update({ author: event.target.value })}
								/>
							</label>

							<label className="flex flex-1 flex-col gap-1">
								<span className="text-cocoa-soft text-xs">Underneath the name</span>
								<Input
									value={review.detail}
									placeholder={index === 0 ? "Wedding cake, March" : ""}
									onChange={(event) => update({ detail: event.target.value })}
								/>
							</label>
						</>
					)}
					body={(review, _index, update) => (
						<label className="flex flex-col gap-1">
							<span className="text-cocoa-soft text-xs">What they said</span>
							<Textarea
								rows={3}
								value={review.body}
								onChange={(event) => update({ body: event.target.value })}
							/>
						</label>
					)}
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
					<Notice
						tone="danger"
						className="mt-5">
						Email isn&rsquo;t configured on the server yet, so nothing is being sent. See the SMTP
						settings in the README.
					</Notice>
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

function toFaqDrafts(faqs: Faq[]): FaqDraft[] {
	return faqs.map((faq) => ({ key: faq.id, question: faq.question, answer: faq.answer }));
}

interface ReviewDraft {
	key: string;
	author: string;
	body: string;
	detail: string;
}

function toReviewDrafts(reviews: Review[]): ReviewDraft[] {
	return reviews.map((review) => ({
		key: review.id,
		author: review.author,
		body: review.body,
		detail: review.detail ?? "",
	}));
}
