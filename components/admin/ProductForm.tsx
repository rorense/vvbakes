"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveProduct } from "@/app/admin/(dashboard)/actions";
import { EMPTY_FORM_STATE, errorFrom, fieldErrorsFrom, succeeded } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { formatPrice, priceForQty } from "@/lib/pricing";
import { useSlugField } from "@/lib/use-slug-field";
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

/**
 * A flavour being edited. `id` is the database row's, and empty for one the
 * owner has just added; carrying it through the form is what lets the save
 * update the existing row instead of replacing it. See `saveVariants`.
 */
interface VariantDraft {
	key: string;
	id: string;
	name: string;
	price: string;
	isAvailable: boolean;
}

function initialTiers(product: Product | null): TierDraft[] {
	return (product?.tiers ?? []).map((tier, index) => ({
		key: `tier-${index}`,
		qty: String(tier.qty),
		price: (tier.priceCents / 100).toString(),
	}));
}

function initialVariants(product: Product | null): VariantDraft[] {
	return (product?.variants ?? []).map((variant, index) => ({
		key: `variant-${index}`,
		id: variant.id,
		name: variant.name,
		price: (variant.unitPriceCents / 100).toString(),
		isAvailable: variant.isAvailable,
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

	const nameAndSlug = useSlugField(product);

	const [unitPrice, setUnitPrice] = useState(
		product ? (product.unitPriceCents / 100).toString() : "",
	);
	const [unitLabel, setUnitLabel] = useState(product?.unitLabel ?? "each");
	const [qtyStep, setQtyStep] = useState(String(product?.qtyStep ?? 1));
	const [tiers, setTiers] = useState<TierDraft[]>(() => initialTiers(product));
	const [variantLabel, setVariantLabel] = useState(product?.variantLabel ?? "Flavour");
	const [variants, setVariants] = useState<VariantDraft[]>(() => initialVariants(product));
	const [imagePath, setImagePath] = useState(product?.imagePath ?? "");

	const tiersJson = JSON.stringify(
		tiers
			.filter((tier) => tier.qty.trim() !== "" && tier.price.trim() !== "")
			.map((tier) => ({ qty: tier.qty, priceCents: tier.price })),
	);

	// A half-typed row is not a flavour yet. Dropping it here rather than failing
	// validation means an empty row left behind after "Add" is simply ignored.
	const filledVariants = variants.filter(
		(variant) => variant.name.trim() !== "" && variant.price.trim() !== "",
	);

	const variantsJson = JSON.stringify(
		filledVariants.map((variant) => ({
			id: variant.id || undefined,
			name: variant.name,
			unitPriceCents: variant.price,
			isAvailable: variant.isAvailable,
		})),
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
				name="variants"
				value={variantsJson}
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
								value={nameAndSlug.name}
								onChange={(event) => nameAndSlug.setName(event.target.value)}
								invalid={Boolean(errors.name)}
							/>
						)}
					</Field>

					<Field
						label="Web address"
						hint={`vvbakes.co.nz/shop/${nameAndSlug.slug || "…"}`}
						required
						error={errors.slug}>
						{(props) => (
							<Input
								{...props}
								name="slug"
								value={nameAndSlug.slug}
								onChange={(event) => nameAndSlug.setSlug(event.target.value)}
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
						hint={
							filledVariants.length > 0
								? `In dollars. Each ${variantLabel.toLowerCase()} below sets its own price, so this one is only used if you take them all away.`
								: "In dollars, e.g. 3 or 12.50"
						}
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
						hint="Leave at 1 unless the item can only be bought in twos, sixes and so on."
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
					variants={filledVariants}
					variantLabel={variantLabel}
				/>
			</AdminCard>

			<AdminCard title={`${variantLabel}s`}>
				<VariantFieldset
					variantLabel={variantLabel}
					setVariantLabel={setVariantLabel}
					variants={variants}
					setVariants={setVariants}
					error={errors.variants}
					labelError={errors.variantLabel}
				/>
			</AdminCard>

			<AdminCard title="Photo">
				<ImageUploader
					slug={nameAndSlug.slug || "product"}
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
 * Repeatable flavours, sizes or fillings, submitted as one JSON field.
 *
 * Adding one turns the product into something a customer chooses from; removing
 * the last one turns it back into a single thing at the price above. There is
 * no switch to forget to flick.
 *
 * The hidden `id` on each row is the existing database row's, and is why this
 * cannot be a plain list of names and prices: it is what a save matches on, so
 * renaming a flavour edits the row an old order points at rather than replacing
 * it with a new one.
 */
function VariantFieldset({
	variantLabel,
	setVariantLabel,
	variants,
	setVariants,
	error,
	labelError,
}: {
	variantLabel: string;
	setVariantLabel: (next: string) => void;
	variants: VariantDraft[];
	setVariants: (next: VariantDraft[]) => void;
	error?: string;
	labelError?: string;
}) {
	const noun = (variantLabel || "Flavour").toLowerCase();

	const update = (index: number, patch: Partial<VariantDraft>) => {
		setVariants(variants.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)));
	};

	const move = (index: number, direction: -1 | 1) => {
		const to = index + direction;
		if (to < 0 || to >= variants.length) return;
		const next = [...variants];
		[next[index], next[to]] = [next[to]!, next[index]!];
		setVariants(next);
	};

	return (
		<div className="flex flex-col gap-5">
			<p className="text-cocoa-soft text-sm">
				For something sold in more than one version: a cake that comes in three flavours, a tin that
				comes in two sizes. Each one carries its own price. Leave this empty for a product that is
				just one thing.
			</p>

			<Field
				label="What the choice is called"
				hint="Flavour, Size, Filling. Shown above the picker on the product page."
				required
				error={labelError}
				className="sm:max-w-xs">
				{(props) => (
					<Input
						{...props}
						name="variantLabel"
						value={variantLabel}
						onChange={(event) => setVariantLabel(event.target.value)}
						invalid={Boolean(labelError)}
					/>
				)}
			</Field>

			<fieldset className="flex flex-col gap-3">
				<legend className="text-sm font-medium">{variantLabel || "Flavour"}s</legend>

				{variants.map((variant, index) => (
					<div
						key={variant.key}
						className="border-line flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-end">
						<label className="flex flex-[2] flex-col gap-1">
							<span className="text-cocoa-soft text-xs">Name</span>
							<input
								className="border-line bg-paper focus-visible:border-cocoa w-full rounded-md border px-3 py-2 text-base"
								value={variant.name}
								placeholder={index === 0 ? "e.g. Chocolate" : ""}
								onChange={(event) => update(index, { name: event.target.value })}
							/>
						</label>

						<label className="flex flex-1 flex-col gap-1">
							<span className="text-cocoa-soft text-xs">Price ($)</span>
							<input
								inputMode="decimal"
								className="border-line bg-paper focus-visible:border-cocoa w-full rounded-md border px-3 py-2 text-base"
								value={variant.price}
								onChange={(event) => update(index, { price: event.target.value })}
							/>
						</label>

						<div className="flex items-center gap-2">
							{/* One flavour can sell out without the rest of the product
							    going with it, so availability lives on the row. */}
							<button
								type="button"
								aria-pressed={variant.isAvailable}
								onClick={() => update(index, { isAvailable: !variant.isAvailable })}
								className={cn(
									"rounded-pill min-h-11 border px-3 text-sm font-medium",
									variant.isAvailable
										? "bg-mint border-transparent"
										: "border-line text-cocoa-soft",
								)}>
								{variant.isAvailable ? "On" : "Sold out"}
							</button>

							<div className="flex">
								<button
									type="button"
									onClick={() => move(index, -1)}
									disabled={index === 0}
									aria-label={`Move ${variant.name || noun} up`}
									className="border-line hover:border-cocoa min-h-11 rounded-l-md border px-2.5 text-sm disabled:opacity-40">
									↑
								</button>
								<button
									type="button"
									onClick={() => move(index, 1)}
									disabled={index === variants.length - 1}
									aria-label={`Move ${variant.name || noun} down`}
									className="border-line hover:border-cocoa -ml-px min-h-11 rounded-r-md border px-2.5 text-sm disabled:opacity-40">
									↓
								</button>
							</div>

							<button
								type="button"
								onClick={() => setVariants(variants.filter((_, i) => i !== index))}
								className="border-line hover:border-danger hover:text-danger min-h-11 rounded-md border px-3 text-sm">
								Remove
							</button>
						</div>
					</div>
				))}

				{error ? <p className="text-danger text-xs font-medium">{error}</p> : null}

				{variants.length < 20 ? (
					<button
						type="button"
						onClick={() =>
							setVariants([
								...variants,
								{ key: `variant-${Date.now()}`, id: "", name: "", price: "", isAvailable: true },
							])
						}
						className="border-line hover:border-cocoa rounded-pill w-fit border px-4 py-2 text-sm font-medium">
						Add {variants.length === 0 ? `a ${noun}` : `another ${noun}`}
					</button>
				) : null}
			</fieldset>
		</div>
	);
}

/**
 * Shows what a customer would actually be charged for a few quantities.
 *
 * Bundle pricing is easy to get wrong by a couple of dollars, and the owner
 * should see the answer before saving rather than discovering it on an order.
 *
 * With flavours in play it shows one block per flavour, because that is where
 * the surprise lives: a bundle is an outright price for N of a line, so the
 * same "4 for $12" is a bigger discount on the expensive flavour than on the
 * cheap one. Better seen here than worked out from an order.
 */
function PricePreview({
	unitPrice,
	unitLabel,
	qtyStep,
	tiers,
	variants,
	variantLabel,
}: {
	unitPrice: string;
	unitLabel: string;
	qtyStep: string;
	tiers: TierDraft[];
	variants: VariantDraft[];
	variantLabel: string;
}) {
	const step = Math.max(1, Math.round(Number(qtyStep) || 1));

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

	// One priced column per flavour, or a single unnamed one for a plain product.
	const columns =
		variants.length > 0
			? variants.map((variant) => ({
					name: variant.name,
					cents: Math.round(Number(variant.price) * 100),
					soldOut: !variant.isAvailable,
				}))
			: [{ name: null, cents: Math.round(Number(unitPrice) * 100), soldOut: false }];

	const priceable = columns.filter((column) => Number.isFinite(column.cents) && column.cents >= 0);
	if (priceable.length === 0) return null;

	const quantities = [...new Set([step, step * 2, step * 4, step * 5])].slice(0, 4);

	return (
		<div className="border-line mt-6 flex flex-col gap-5 rounded-md border p-4">
			{priceable.map((column, index) => (
				<div key={column.name ?? index}>
					<p className="text-cocoa-soft text-2xs mb-3 font-medium tracking-widest uppercase">
						{column.name
							? `${column.name}${column.soldOut ? " — sold out" : ""}`
							: "What customers pay"}
					</p>
					<ul className="flex flex-col gap-1.5">
						{quantities.map((qty) => {
							const priced = priceForQty(column.cents, parsedTiers, qty, unitLabel || "each");
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
			))}
			{variants.length > 0 ? (
				<p className="text-cocoa-soft text-xs">
					One {variantLabel.toLowerCase()} per line. A bundle price buys that many of the same one.
				</p>
			) : null}
		</div>
	);
}
