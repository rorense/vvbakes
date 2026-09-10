"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveProduct } from "@/app/admin/(dashboard)/actions";
import { EMPTY_FORM_STATE, errorFrom, fieldErrorsFrom, succeeded } from "@/lib/action-state";
import { formatPrice, priceForQty } from "@/lib/pricing";
import { slugify } from "@/lib/validation";
import { ALLERGEN_LABELS, ALLERGENS, type Category, type Product } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import {
	Checkbox,
	Field,
	FormError,
	FormSuccess,
	Input,
	Select,
	Switch,
	Textarea,
} from "@/components/ui/Form";
import { AdminCard } from "./AdminShell";
import { ImageUploader } from "./ImageUploader";

interface TierDraft {
	key: string;
	qty: string;
	price: string;
}

function initialTiers(product: Product | null): TierDraft[] {
	return (product?.tiers ?? []).map((tier, index) => ({
		key: `tier-${index}`,
		qty: String(tier.qty),
		price: (tier.priceCents / 100).toString(),
	}));
}

export function ProductForm({
	product,
	categories,
}: {
	product: Product | null;
	categories: Category[];
}) {
	const [state, action, pending] = useActionState(saveProduct, EMPTY_FORM_STATE);
	const errors = fieldErrorsFrom(state);
	const error = errorFrom(state);

	const [name, setName] = useState(product?.name ?? "");
	const [slug, setSlug] = useState(product?.slug ?? "");
	// A slug is only auto-filled while it has never been edited by hand, and only
	// for a new product. Changing the slug of a live product would break every
	// link to it that is already out in the world.
	const [slugTouched, setSlugTouched] = useState(Boolean(product));

	const [unitPrice, setUnitPrice] = useState(
		product ? (product.unitPriceCents / 100).toString() : "",
	);
	const [unitLabel, setUnitLabel] = useState(product?.unitLabel ?? "each");
	const [qtyStep, setQtyStep] = useState(String(product?.qtyStep ?? 1));
	const [tiers, setTiers] = useState<TierDraft[]>(() => initialTiers(product));
	const [imagePath, setImagePath] = useState(product?.imagePath ?? "");

	const slugValue = slugTouched ? slug : slugify(name);

	const tiersJson = JSON.stringify(
		tiers
			.filter((tier) => tier.qty.trim() !== "" && tier.price.trim() !== "")
			.map((tier) => ({ qty: tier.qty, priceCents: tier.price })),
	);

	return (
		<form
			action={action}
			className="flex flex-col gap-6">
			{product ? (
				<input
					type="hidden"
					name="id"
					value={product.id}
				/>
			) : null}
			<input
				type="hidden"
				name="tiers"
				value={tiersJson}
			/>
			<input
				type="hidden"
				name="imagePath"
				value={imagePath}
			/>
			<input
				type="hidden"
				name="sortOrder"
				value={product?.sortOrder ?? 999}
			/>

			<AdminCard title="Basics">
				<div className="grid gap-5 sm:grid-cols-2">
					<Field
						label="Name"
						required
						error={errors.name}
						className="sm:col-span-2">
						{(props) => (
							<Input
								{...props}
								name="name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								invalid={Boolean(errors.name)}
							/>
						)}
					</Field>

					<Field
						label="Web address"
						hint={`vvbakes.co.nz/shop/${slugValue || "…"}`}
						required
						error={errors.slug}>
						{(props) => (
							<Input
								{...props}
								name="slug"
								value={slugValue}
								onChange={(event) => {
									setSlugTouched(true);
									setSlug(slugify(event.target.value));
								}}
								invalid={Boolean(errors.slug)}
							/>
						)}
					</Field>

					<Field
						label="Category"
						required
						error={errors.categoryId}>
						{(props) => (
							<Select
								{...props}
								name="categoryId"
								defaultValue={product?.categoryId ?? ""}
								invalid={Boolean(errors.categoryId)}>
								<option value="">Choose a category…</option>
								{categories.map((category) => (
									<option
										key={category.id}
										value={category.id}>
										{category.name}
									</option>
								))}
							</Select>
						)}
					</Field>

					<Field
						label="Description"
						hint="One or two sentences. Shown on the product page and the card."
						error={errors.description}
						className="sm:col-span-2">
						{(props) => (
							<Textarea
								{...props}
								name="description"
								rows={3}
								defaultValue={product?.description ?? ""}
							/>
						)}
					</Field>
				</div>
			</AdminCard>

			<AdminCard title="Price">
				<div className="grid gap-5 sm:grid-cols-3">
					<Field
						label="Price"
						hint="In dollars, e.g. 3 or 12.50"
						required
						error={errors.unitPriceCents}>
						{(props) => (
							<Input
								{...props}
								name="unitPrice"
								inputMode="decimal"
								value={unitPrice}
								onChange={(event) => setUnitPrice(event.target.value)}
								invalid={Boolean(errors.unitPriceCents)}
							/>
						)}
					</Field>

					<Field
						label="Per"
						hint="each, slice, box of 6"
						required
						error={errors.unitLabel}>
						{(props) => (
							<Input
								{...props}
								name="unitLabel"
								value={unitLabel}
								onChange={(event) => setUnitLabel(event.target.value)}
								invalid={Boolean(errors.unitLabel)}
							/>
						)}
					</Field>

					<Field
						label="Sold in multiples of"
						hint="Cookies at 2 for $5 are priced 2.50 each with a step of 2."
						error={errors.qtyStep}>
						{(props) => (
							<Input
								{...props}
								name="qtyStep"
								inputMode="numeric"
								value={qtyStep}
								onChange={(event) => setQtyStep(event.target.value)}
								invalid={Boolean(errors.qtyStep)}
							/>
						)}
					</Field>

					<Field
						label="Most per order"
						hint="Leave blank for no limit."
						error={errors.maxPerOrder}
						className="sm:col-span-1">
						{(props) => (
							<Input
								{...props}
								name="maxPerOrder"
								inputMode="numeric"
								defaultValue={product?.maxPerOrder ?? ""}
								invalid={Boolean(errors.maxPerOrder)}
							/>
						)}
					</Field>
				</div>

				<TierFieldset
					tiers={tiers}
					setTiers={setTiers}
					error={errors.tiers}
				/>

				<PricePreview
					unitPrice={unitPrice}
					unitLabel={unitLabel}
					qtyStep={qtyStep}
					tiers={tiers}
				/>
			</AdminCard>

			<AdminCard title="Photo">
				<ImageUploader
					slug={slugValue || "product"}
					value={imagePath}
					onChange={setImagePath}
				/>
				<div className="mt-5">
					<Field
						label="Photo description"
						hint="For screen readers and when the image can't load. Describe what's in the photo."
						error={errors.imageAlt}>
						{(props) => (
							<Input
								{...props}
								name="imageAlt"
								defaultValue={product?.imageAlt ?? ""}
							/>
						)}
					</Field>
				</div>
			</AdminCard>

			<AdminCard title="Availability">
				<div className="flex flex-col gap-5">
					<Switch
						name="isAvailable"
						label="Available to order"
						description="Turn off to keep it in the shop but stop people ordering it."
						defaultChecked={product ? product.isAvailable : true}
					/>
					<Switch
						name="isFeatured"
						label="Show on the home page"
						description="Up to three featured products appear under 'A few favourites'."
						defaultChecked={product?.isFeatured ?? false}
					/>
					<Field
						label="Note when unavailable"
						hint='Shown on the card instead of "Sold out", e.g. "Back in December".'
						error={errors.availabilityNote}>
						{(props) => (
							<Input
								{...props}
								name="availabilityNote"
								defaultValue={product?.availabilityNote ?? ""}
							/>
						)}
					</Field>
				</div>
			</AdminCard>

			<AdminCard title="Allergens">
				<p className="text-cocoa-soft mb-4 text-sm">
					Tick anything this contains. Shown on the product page.
				</p>
				<div className="grid gap-3 sm:grid-cols-3">
					{ALLERGENS.map((allergen) => (
						<Checkbox
							key={allergen}
							name="allergens"
							value={allergen}
							label={ALLERGEN_LABELS[allergen]}
							defaultChecked={product?.allergens.includes(allergen) ?? false}
						/>
					))}
				</div>
			</AdminCard>

			{error ? <FormError>{error}</FormError> : null}
			{succeeded(state) ? <FormSuccess>Saved.</FormSuccess> : null}

			<div className="flex flex-wrap items-center gap-3">
				<Button
					type="submit"
					size="lg"
					disabled={pending}>
					{pending ? "Saving…" : product ? "Save changes" : "Add product"}
				</Button>
				<Link
					href="/admin/products"
					className="text-cocoa-soft hover:text-cocoa text-sm underline underline-offset-4">
					Back to products
				</Link>
			</div>
		</form>
	);
}

/** Repeatable "N for $X" rows. Submitted as one JSON field. */
function TierFieldset({
	tiers,
	setTiers,
	error,
}: {
	tiers: TierDraft[];
	setTiers: (next: TierDraft[]) => void;
	error?: string;
}) {
	return (
		<fieldset className="mt-6 flex flex-col gap-3">
			<legend className="text-sm font-medium">Bundle prices</legend>
			<p className="text-cocoa-soft text-xs">
				Optional. &ldquo;4 for $12&rdquo; is a quantity of 4 at a price of 12. Customers
				automatically get the cheapest combination.
			</p>

			{tiers.map((tier, index) => (
				<div
					key={tier.key}
					className="flex items-end gap-3">
					<label className="flex flex-1 flex-col gap-1">
						<span className="text-cocoa-soft text-xs">Quantity</span>
						<input
							inputMode="numeric"
							className="border-line bg-paper focus-visible:border-cocoa w-full rounded-md border px-3 py-2 text-base"
							value={tier.qty}
							onChange={(event) => {
								const next = [...tiers];
								next[index] = { ...tier, qty: event.target.value };
								setTiers(next);
							}}
						/>
					</label>

					<label className="flex flex-1 flex-col gap-1">
						<span className="text-cocoa-soft text-xs">Price ($)</span>
						<input
							inputMode="decimal"
							className="border-line bg-paper focus-visible:border-cocoa w-full rounded-md border px-3 py-2 text-base"
							value={tier.price}
							onChange={(event) => {
								const next = [...tiers];
								next[index] = { ...tier, price: event.target.value };
								setTiers(next);
							}}
						/>
					</label>

					<button
						type="button"
						onClick={() => setTiers(tiers.filter((_, i) => i !== index))}
						className="border-line hover:border-danger hover:text-danger min-h-11 rounded-md border px-3 text-sm">
						Remove
					</button>
				</div>
			))}

			{error ? <p className="text-danger text-xs font-medium">{error}</p> : null}

			{tiers.length < 6 ? (
				<button
					type="button"
					onClick={() => setTiers([...tiers, { key: `tier-${Date.now()}`, qty: "", price: "" }])}
					className="border-line hover:border-cocoa rounded-pill w-fit border px-4 py-2 text-sm font-medium">
					Add a bundle price
				</button>
			) : null}
		</fieldset>
	);
}

/**
 * Shows what a customer would actually be charged for a few quantities.
 *
 * Bundle pricing is easy to get wrong by a couple of dollars, and the owner
 * should see the answer before saving rather than discovering it on an order.
 */
function PricePreview({
	unitPrice,
	unitLabel,
	qtyStep,
	tiers,
}: {
	unitPrice: string;
	unitLabel: string;
	qtyStep: string;
	tiers: TierDraft[];
}) {
	const cents = Math.round(Number(unitPrice) * 100);
	const step = Math.max(1, Math.round(Number(qtyStep) || 1));

	if (!Number.isFinite(cents) || cents < 0 || unitPrice.trim() === "") return null;

	const parsedTiers = tiers
		.map((tier) => ({
			qty: Math.round(Number(tier.qty)),
			priceCents: Math.round(Number(tier.price) * 100),
		}))
		.filter(
			(tier) =>
				Number.isInteger(tier.qty) &&
				tier.qty >= 2 &&
				Number.isFinite(tier.priceCents) &&
				tier.priceCents >= 0,
		);

	const quantities = [...new Set([step, step * 2, step * 4, step * 5])].slice(0, 4);

	return (
		<div className="border-line mt-6 rounded-md border p-4">
			<p className="text-cocoa-soft text-2xs mb-3 font-medium tracking-widest uppercase">
				What customers pay
			</p>
			<ul className="flex flex-col gap-1.5">
				{quantities.map((qty) => {
					const priced = priceForQty(cents, parsedTiers, qty, unitLabel || "each");
					return (
						<li
							key={qty}
							className="flex items-baseline justify-between gap-4 text-sm">
							<span className="text-cocoa-soft">
								{qty} × {unitLabel || "each"}
							</span>
							<span className="flex items-baseline gap-3">
								<span className="text-cocoa-soft text-xs">{priced.note}</span>
								<span className="font-medium">{formatPrice(priced.totalCents)}</span>
							</span>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
