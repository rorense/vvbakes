"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveProduct } from "@/app/admin/(dashboard)/actions";
import { EMPTY_FORM_STATE, errorFrom, fieldErrorsFrom, listErrorFrom } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { moveItem, patchItem } from "@/lib/list-edit";
import {
	formatPrice,
	optionGroups,
	priceForQty,
	variantOptionIds,
	VARIANT_NAME_SEPARATOR,
} from "@/lib/pricing";
import { cellKey, hangCells } from "@/lib/price-grid";
import { useSlugField } from "@/lib/use-slug-field";
import { allergenSentence } from "@/lib/allergens";
import {
	ALLERGEN_LABELS,
	ALLERGENS,
	type Allergen,
	type Category,
	type Extra,
	type Product,
} from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, FormError, Input, Select, Switch, Textarea } from "@/components/ui/Form";
import { Notice } from "@/components/ui/Notice";
import { useToastOnResult } from "@/components/ui/Toast";
import { AdminCard } from "./AdminShell";
import { DraftList } from "./DraftList";
import { ImageUploader } from "./ImageUploader";

/**
 * One extra being edited. `key` is React's and belongs to the draft; `id` is the
 * database row's and is absent until the first save, which is what tells the
 * server to insert rather than update.
 *
 * The price is held as the string in the box rather than as cents, so a
 * half-typed "12." is something you can go on typing into instead of a number
 * the field has already rounded.
 */
interface ExtraDraft {
	key: string;
	id?: string;
	name: string;
	description: string;
	price: string;
	isAvailable: boolean;
}

function toExtraDrafts(extras: Extra[]): ExtraDraft[] {
	return extras.map((extra) => ({
		key: extra.id,
		id: extra.id,
		name: extra.name,
		description: extra.description ?? "",
		price: (extra.priceCents / 100).toString(),
		isAvailable: extra.isAvailable,
	}));
}

interface TierDraft {
	key: string;
	qty: string;
	price: string;
}

/**
 * One line of the price guide being edited: '8" — 3 layers', 75, a starting
 * price rather than an add-on.
 *
 * No id, unlike an extra: nothing points at one of these, so a save replaces
 * the list outright and `key` is the draft's own. The price is the string in
 * the box, for the reason `ExtraDraft` gives.
 */
interface PriceGuideDraft {
	key: string;
	label: string;
	price: string;
	isAddition: boolean;
}

function initialPriceGuide(product: Product | null): PriceGuideDraft[] {
	return (product?.priceGuide ?? []).map((row, index) => ({
		key: `guide-${index}`,
		label: row.label,
		price: (row.priceCents / 100).toString(),
		isAddition: row.isAddition,
	}));
}

/**
 * One option in one group, being edited: "Chocolate", "3 layers".
 *
 * `id` is the database row's, and empty for one the owner has just added;
 * carrying it through the form is what lets the save update the existing row
 * instead of replacing it. `key` is React's, and unlike the id it exists from
 * the moment the row is added, which is what the price grid below is keyed on.
 *
 * `imagePath` is an object path already uploaded to storage, not a pending
 * file: the upload happens as soon as the photo is chosen, so a save only ever
 * carries the path.
 */
interface OptionDraft {
	key: string;
	id: string;
	name: string;
	imagePath: string;
	/** What this one adds to the product's allergens, never a replacement. */
	allergens: Allergen[];
	isAvailable: boolean;
}

/** One option group, being edited: "Flavour", with its options under it. */
interface GroupDraft {
	key: string;
	id: string;
	name: string;
	options: OptionDraft[];
}

/**
 * One priced combination — the thing a customer actually buys, and the row an
 * order points at.
 *
 * Held in a map keyed by the options it is made of rather than in a list,
 * because the grid is generated from the groups and regenerates whenever she
 * adds an option. A list would have to be reconciled by position on every
 * keystroke; a map means a combination keeps its price and its id however the
 * grid is rebuilt around it, and a combination she removes and puts back finds
 * its old price waiting.
 *
 * `imagePath` and `allergens` are carried through unseen. They belong to the
 * options now, but a product that was built before there were options has them
 * on the combination, and a save that dropped them would take a photo off a
 * product that has been showing it for months.
 */
interface CellDraft {
	id: string;
	price: string;
	isAvailable: boolean;
	imagePath: string;
	allergens: Allergen[];
}

const EMPTY_CELL: CellDraft = {
	id: "",
	price: "",
	isAvailable: true,
	imagePath: "",
	allergens: [],
};

/**
 * Every combination the current groups describe, in reading order: the last
 * group varies fastest, so the flavours stay together and the layers count up
 * inside them.
 */
function combinationsOf(groups: GroupDraft[]): OptionDraft[][] {
	if (groups.length === 0) return [];

	return groups.reduce<OptionDraft[][]>(
		(combinations, group) =>
			combinations.flatMap((combination) =>
				group.options.map((option) => [...combination, option]),
			),
		[[]],
	);
}

/** How many combinations the owner is asked to price before it is too many. */
const MAX_COMBINATIONS = 500;

/**
 * How many of these one product may have.
 *
 * Named for the code's own words rather than the form's. The form labels an
 * option group "Variant" and its options "Options", which reads well over the
 * boxes but cannot be used here: `variants` already means a priced combination
 * everywhere below this, down to the `product_variants` table.
 */
const MAX_OPTION_GROUPS = 5;

/** How many options any one of them may offer. */
const MAX_OPTIONS = 40;

function initialTiers(product: Product | null): TierDraft[] {
	return (product?.tiers ?? []).map((tier, index) => ({
		key: `tier-${index}`,
		qty: String(tier.qty),
		price: (tier.priceCents / 100).toString(),
	}));
}

/**
 * The option groups this product offers, ready to edit.
 *
 * Read through `optionGroups`, so a product that has never had more than one
 * arrives here as the single group it has always been rather than as an empty
 * form. Its options have no rows of their own — `optionGroups` borrows
 * the variants' ids to stand in for them — so their ids are dropped and the
 * first save creates them for real. The variants themselves keep their ids, in
 * `initialCells` below, which is what keeps past orders pointing at something.
 *
 * Keys are derived from position rather than minted, so calling this twice
 * gives the same keys and `initialCells` can be matched against it.
 */
function initialGroups(product: Product | null): GroupDraft[] {
	if (!product) return [];

	return optionGroups(product).map((group, index) => ({
		key: `group-${index}`,
		id: group.id,
		name: group.name,
		options: group.options.map((option, at) => ({
			key: `option-${index}-${at}`,
			id: group.id ? option.id : "",
			name: option.name,
			imagePath: option.imagePath ?? "",
			allergens: option.allergens,
			isAvailable: option.isAvailable,
		})),
	}));
}

function initialCells(product: Product | null, groups: GroupDraft[]): Record<string, CellDraft> {
	if (!product) return {};

	// A product that has only ever had one group says "sold out" about the
	// flavour, and the flavour is an option now, so that is where the switch is
	// read back in. The combination is left on: the two multiply, so what a
	// customer sees is identical, and the switch ends up where she will look for
	// it rather than in two places at once.
	const converting = product.optionGroups.length === 0;
	const cells: Record<string, CellDraft> = {};

	for (const variant of product.variants) {
		const chosen = new Set(variantOptionIds(product, variant));

		// Built by walking the groups rather than the stored options, because
		// the key has to be in group order and the stored list is in whatever
		// order it came back.
		const keys = optionGroups(product).map((group, index) => {
			const at = group.options.findIndex((option) => chosen.has(option.id));
			return at < 0 ? null : groups[index]?.options[at]?.key;
		});
		if (keys.some((key) => !key)) continue;

		cells[keys.join("|")] = {
			id: variant.id,
			price: (variant.unitPriceCents / 100).toString(),
			isAvailable: converting ? true : variant.isAvailable,
			imagePath: variant.imagePath ?? "",
			allergens: variant.allergens,
		};
	}

	return cells;
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

	// The page does not move after a save — the same form is still sitting
	// there, looking exactly as it did — so the toast is the whole of the answer.
	useToastOnResult(state, product ? "Product saved." : "Product added.");

	const nameAndSlug = useSlugField(product);

	const [unitPrice, setUnitPrice] = useState(
		product ? (product.unitPriceCents / 100).toString() : "",
	);
	const [unitLabel, setUnitLabel] = useState(product?.unitLabel ?? "each");
	const [qtyStep, setQtyStep] = useState(String(product?.qtyStep ?? 1));
	const [tiers, setTiers] = useState<TierDraft[]>(() => initialTiers(product));
	const [priceGuide, setPriceGuide] = useState<PriceGuideDraft[]>(() => initialPriceGuide(product));
	const [priceGuideNote, setPriceGuideNote] = useState(product?.priceGuideNote ?? "");
	// Controlled, unlike the two switches beside it, because the price guide is
	// only worth showing her on a product this is on for. Still submitted either
	// way; see the hidden fields.
	const [priceOnRequest, setPriceOnRequest] = useState(product?.priceOnRequest ?? false);
	const [extraRows, setExtraRows] = useState<ExtraDraft[]>(() =>
		toExtraDrafts(product?.extras ?? []),
	);
	const [groups, setGroups] = useState<GroupDraft[]>(() => initialGroups(product));
	// Safe to build the groups twice: `initialGroups` derives its keys from
	// position, so both calls agree on what the cells are keyed by.
	const [cells, setCells] = useState<Record<string, CellDraft>>(() =>
		initialCells(product, initialGroups(product)),
	);
	const [imagePath, setImagePath] = useState(product?.imagePath ?? "");

	// Whether this product is sold in variants is a question about the form,
	// not a column. The database still decides it the only way that cannot
	// drift — by whether any variant rows exist — so there is no flag here to
	// disagree with reality, only a switch that decides what she is shown.
	const [sellsVariants, setSellsVariants] = useState(() => (product?.variants.length ?? 0) > 0);
	const savedVariantCount = product?.variants.length ?? 0;

	const tiersJson = JSON.stringify(
		tiers
			.filter((tier) => tier.qty.trim() !== "" && tier.price.trim() !== "")
			.map((tier) => ({ qty: tier.qty, priceCents: tier.price })),
	);

	// A row with nothing typed in either box is someone who pressed "Add" and
	// changed their mind. One with a label and no price is a real mistake, and is
	// left in for the server to complain about.
	const priceGuideJson = JSON.stringify(
		priceGuide
			.map((row) => ({
				label: row.label.trim(),
				priceCents: row.price.trim(),
				isAddition: row.isAddition,
			}))
			.filter((row) => row.label !== "" || row.priceCents !== ""),
	);

	// The id travels with the row, unlike the bundle prices above, which are
	// replaced outright on every save. An order points at the extra it carried,
	// so an extra has an identity worth keeping across a rename or a re-price.
	//
	// A row with nothing in any box is someone who pressed "Add" and changed
	// their mind, so it is dropped rather than failed. One with a name and no
	// price is a real mistake and is left in for the server to complain about.
	const extrasJson = JSON.stringify(
		extraRows
			.map((row) => ({
				id: row.id,
				name: row.name.trim(),
				description: row.description.trim(),
				priceCents: row.price.trim(),
				isAvailable: row.isAvailable,
			}))
			.filter((row) => row.name !== "" || row.description !== "" || row.priceCents !== ""),
	);

	const extrasError = listErrorFrom(errors, "extras");

	// A half-typed row is not a group or an option yet. Dropping them here
	// rather than failing validation means an empty row left behind after "Add"
	// is simply ignored.
	//
	// Turning the switch off does not throw the rows away, so flicking it back on
	// in the same sitting brings them back. It does stop them being submitted,
	// which is what turns the product into a single thing on save.
	const filledGroups = sellsVariants
		? groups
				.filter((group) => group.name.trim() !== "")
				.map((group) => ({
					...group,
					options: group.options.filter((option) => option.name.trim() !== ""),
				}))
				.filter((group) => group.options.length > 0)
		: [];

	const combinations = combinationsOf(filledGroups);
	const hungCells = hangCells(combinations, cells);
	const cellFor = (combination: OptionDraft[]): CellDraft =>
		hungCells[cellKey(combination)] ?? EMPTY_CELL;

	// A combination with no price is one she does not sell: the lemon in three
	// layers, the tin in a size she stopped stocking. The grid still offers it,
	// and leaving it blank is how she says no.
	const filledVariants = combinations.filter(
		(combination) => cellFor(combination).price.trim() !== "",
	);

	// Groups and priced combinations travel together — a group nobody can buy an
	// option from is not something the shop can render. Until one price is
	// typed this saves as a plain product, which is also how the old flat list
	// behaved when every row was left blank.
	const submittedGroups = filledVariants.length > 0 ? filledGroups : [];

	// Which of the product's existing combinations this save would remove: one
	// whose price has been cleared, or one whose option has been taken away.
	// Named out loud below so it is never a surprise, and named in the
	// submission because the save refuses to delete a row nobody listed.
	const submittedIds = new Set(
		filledVariants.map((combination) => cellFor(combination).id).filter(Boolean),
	);
	const removedVariants = (product?.variants ?? []).filter(
		(variant) => !submittedIds.has(variant.id),
	);

	// The product still needs a price of its own: the column is not null, and a
	// product built out of variants from the start has never had one typed into
	// it. The cheapest variant stands in, so taking every variant away later
	// leaves a price that means something rather than a zero. Anything unusable in
	// the box is ignored rather than submitted, because the box is hidden and she
	// would have no way to see what the complaint was about.
	const typedPrice = Number(unitPrice);
	const typedPriceUsable =
		unitPrice.trim() !== "" && Number.isFinite(typedPrice) && typedPrice >= 0;
	const cheapestVariant = filledVariants
		.map((combination) => Number(cellFor(combination).price))
		.filter((price) => Number.isFinite(price) && price >= 0)
		.sort((a, b) => a - b)[0];
	const submittedUnitPrice =
		!sellsVariants || typedPriceUsable ? unitPrice : (cheapestVariant?.toString() ?? "0");

	// What the picker asks when this product is down to one group again. Kept
	// in step with the first group rather than edited separately, so a product
	// that loses its groups does not go back to asking something she renamed a
	// year ago.
	const submittedVariantLabel = filledGroups[0]?.name.trim() || "Flavour";

	const optionGroupsJson = JSON.stringify(
		submittedGroups.map((group) => ({
			id: group.id || undefined,
			name: group.name,
			options: group.options.map((option) => ({
				id: option.id || undefined,
				name: option.name,
				imagePath: option.imagePath,
				allergens: option.allergens,
				isAvailable: option.isAvailable,
			})),
		})),
	);

	const variantsJson = JSON.stringify(
		filledVariants.map((combination) => {
			const cell = cellFor(combination);
			return {
				id: cell.id || undefined,
				name: combination.map((option) => option.name.trim()).join(VARIANT_NAME_SEPARATOR),
				unitPriceCents: cell.price,
				imagePath: cell.imagePath,
				allergens: cell.allergens,
				isAvailable: cell.isAvailable,
				// By position, because most of these options have no id yet: they are
				// being created by this same submission. See `productVariantSchema`.
				options: combination.map((option, group) =>
					submittedGroups[group]!.options.indexOf(option),
				),
			};
		}),
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
			{/* Both submitted whether or not the product is priced on request, so
			    that switching it off and saving does not quietly throw away a guide
			    she spent ten minutes on. Only the shop decides to show them. */}
			<input
				type="hidden"
				name="priceGuide"
				value={priceGuideJson}
			/>
			<input
				type="hidden"
				name="priceGuideNote"
				value={priceGuideNote}
			/>
			<input
				type="hidden"
				name="optionGroups"
				value={optionGroupsJson}
			/>
			<input
				type="hidden"
				name="removedVariants"
				value={JSON.stringify(removedVariants.map((variant) => variant.id))}
			/>
			<input
				type="hidden"
				name="variants"
				value={variantsJson}
			/>
			<input
				type="hidden"
				name="extras"
				value={extrasJson}
			/>
			{/* Always submitted, groups or not, so that turning them off and on
			    again does not quietly rename what the picker asks for. */}
			<input
				type="hidden"
				name="variantLabel"
				value={submittedVariantLabel}
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

			<AdminCard title="Variants">
				<div className="flex flex-col gap-5">
					<Switch
						checked={sellsVariants}
						onChange={(event) => setSellsVariants(event.target.checked)}
						label="This is sold in variants"
						description="A cake that comes in three flavours and one, two or three layers. Add one variant or two; every combination of the options gets a price of its own."
					/>

					{sellsVariants ? (
						<>
							<GroupFieldset
								slug={nameAndSlug.slug || "product"}
								groups={groups}
								setGroups={setGroups}
								error={errors.optionGroups}
							/>
							<PriceGrid
								groups={filledGroups}
								combinations={combinations}
								cells={cells}
								cellFor={cellFor}
								setCells={setCells}
								savedVariantCount={savedVariantCount}
								error={errors.variants}
							/>
							{removedVariants.length > 0 ? (
								<Notice tone="warning">
									Saving now removes {removedVariants.map((variant) => variant.name).join(", ")}. A
									combination with no price is one you don&rsquo;t make. Orders already placed keep
									the name they were given.
								</Notice>
							) : null}
						</>
					) : savedVariantCount > 0 ? (
						<>
							{/* The one place an empty submission is meant. Without it the save
							    refuses to act on one, so a form that goes wrong cannot quietly
							    take every flavour off a product. See saveVariants. */}
							<input
								type="hidden"
								name="removeVariants"
								value="on"
							/>
							<Notice tone="warning">
								Saving now removes the {savedVariantCount}{" "}
								{savedVariantCount === 1 ? "variant" : "variants"} this product has, and it goes
								back to the one price below. Orders already placed keep the name they were given.
							</Notice>
						</>
					) : null}
				</div>
			</AdminCard>

			<AdminCard title="Price">
				<div className="grid gap-5 sm:grid-cols-3">
					{sellsVariants ? (
						// Every variant sets its own, so a box here would be a second price
						// beside the ones typed above. Submitted unseen so the product still
						// has a price to fall back on if the variants ever go.
						<input
							type="hidden"
							name="unitPrice"
							value={submittedUnitPrice}
						/>
					) : (
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
					)}

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
						label="Minimum per order"
						hint="The fewest someone can order. Leave blank for no minimum."
						error={errors.minPerOrder}
						className="sm:col-span-1">
						{(props) => (
							<Input
								{...props}
								name="minPerOrder"
								inputMode="numeric"
								defaultValue={product?.minPerOrder ?? ""}
								invalid={Boolean(errors.minPerOrder)}
							/>
						)}
					</Field>
				</div>

				<TierFieldset
					tiers={tiers}
					setTiers={setTiers}
					error={errors.tiers}
				/>

				{priceOnRequest ? (
					<PriceGuideFieldset
						rows={priceGuide}
						setRows={setPriceGuide}
						note={priceGuideNote}
						setNote={setPriceGuideNote}
						error={listErrorFrom(errors, "priceGuide")}
						noteError={errors.priceGuideNote}
					/>
				) : null}

				<PricePreview
					unitPrice={submittedUnitPrice}
					unitLabel={unitLabel}
					qtyStep={qtyStep}
					tiers={tiers}
					combinations={filledVariants}
					cellFor={cellFor}
				/>
			</AdminCard>

			<AdminCard title="Extras">
				<p className="text-cocoa-soft mb-5 text-sm">
					Things a customer can add to this one: candles, a gift box, a card. The price is per item
					ordered, so two of these with candles is two sets of candles. Each product has its own
					list, so candles here can cost something different from candles on another cake. No
					extras, nothing shown on the page.
				</p>

				<DraftList
					rows={extraRows}
					setRows={setExtraRows}
					legend="Extras"
					noun="extra"
					error={extrasError}
					blank={() => ({
						key: `new-${Date.now()}`,
						name: "",
						description: "",
						price: "",
						isAvailable: true,
					})}
					labelOf={(extra, index) => extra.name || `extra ${index + 1}`}
					fields={(extra, index, update) => (
						<>
							<label className="flex flex-1 flex-col gap-1">
								<span className="text-cocoa-soft text-xs">Name</span>
								<Input
									value={extra.name}
									placeholder={index === 0 ? "Birthday candles" : ""}
									onChange={(event) => update({ name: event.target.value })}
								/>
							</label>

							<label className="flex w-full flex-col gap-1 sm:w-28">
								<span className="text-cocoa-soft text-xs">Price</span>
								<Input
									value={extra.price}
									inputMode="decimal"
									placeholder={index === 0 ? "3" : ""}
									onChange={(event) => update({ price: event.target.value })}
								/>
							</label>
						</>
					)}
					body={(extra, _index, update) => (
						<div className="flex flex-col gap-3">
							<label className="flex flex-col gap-1">
								<span className="text-cocoa-soft text-xs">The line underneath (optional)</span>
								<Input
									value={extra.description}
									placeholder="Six, in whatever colour goes with the icing"
									onChange={(event) => update({ description: event.target.value })}
								/>
							</label>

							{/* Off is how something comes back later without being retyped.
							    It hides the extra on the page, and refuses a basket that was
							    filled before you switched it off rather than sending the order
							    through without it. */}
							<Switch
								label="Available"
								description="Turn off to hide it without deleting it."
								checked={extra.isAvailable}
								onChange={(event) => update({ isAvailable: event.target.checked })}
							/>
						</div>
					)}
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
					{sellsVariants ? (
						<>
							{/* Each variant has its own switch, so the product's would be a
							    second, quieter answer to the same question — and one that
							    silently outranks every switch above it. Held on instead. */}
							<input
								type="hidden"
								name="isAvailable"
								value="on"
							/>
							<p className="text-cocoa-soft text-sm">
								Every option and every combination has its own on/sold-out switch, up in Variants.
								Switching an option off takes every combination made of it with it, and the product
								drops out of the shop by itself once nothing is left to buy.
							</p>
						</>
					) : (
						<Switch
							name="isAvailable"
							label="Available to order"
							description="Turn off to keep it in the shop but stop people ordering it."
							defaultChecked={product ? product.isAvailable : true}
						/>
					)}
					<Switch
						name="isFeatured"
						label="Show on the home page"
						description="Up to three featured products appear under 'A few favourites'."
						defaultChecked={product?.isFeatured ?? false}
					/>
					{/* The three switches that make an ordinary product a made-to-order
					    one. Kept apart because they do not always travel together:
					    personalised cookies are made to a brief and still have a price,
					    a dessert table is priced on request without anybody sending a
					    picture, and a cupcake takes a flavour of its own without being
					    either. */}
					<Switch
						name="priceOnRequest"
						label="Price on request"
						description="For work you price after seeing the brief. The shop shows 'Price on request' instead of a number, the item adds nothing to the customer's total, and you set the price on the order once it comes in. Starting prices for it go under Price, above."
						checked={priceOnRequest}
						onChange={(event) => setPriceOnRequest(event.target.checked)}
					/>
					<Switch
						name="wantsBrief"
						label="Ask for photos and a link"
						description="Adds an inspiration photo upload and a link field to this product's page. Every product already asks for a note; this is for the ones a picture is the brief for."
						defaultChecked={product?.wantsBrief ?? false}
					/>
					<Switch
						name="wantsCustomFlavour"
						label="Ask for a flavour of their own"
						description="Adds a custom flavour box, and a question about the frosting, to this product's page. For the things you'll make in a flavour that isn't on the menu — not for the ones that come how they come."
						defaultChecked={product?.wantsCustomFlavour ?? false}
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

			<AdminCard title={sellsVariants ? "Allergens in every variant" : "Allergens"}>
				<p className="text-cocoa-soft mb-4 text-sm">
					{sellsVariants
						? "Tick what every one of them contains. Anything only one of them has — walnuts in the carrot one — goes under Extra allergens on that option, not here."
						: "Tick anything this contains. Shown on the product page."}
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
 * Where a product priced on request says what its prices start at.
 *
 * "Price on request" is honest and it is also a wall: someone with no idea
 * whether a birthday cake is forty dollars or four hundred mostly does not
 * ask. These lines are the answer to that and nothing more — no basket reads
 * them, no order is priced from them, and the note underneath is where she
 * says what moves the number.
 *
 * Shown only while the switch down in Availability is on, because on any other
 * product there is a real price table and this would be a second, vaguer answer
 * to the same question. The rows are submitted either way, so flicking it off
 * and saving does not throw the guide away.
 */
function PriceGuideFieldset({
	rows,
	setRows,
	note,
	setNote,
	error,
	noteError,
}: {
	rows: PriceGuideDraft[];
	setRows: (next: PriceGuideDraft[]) => void;
	note: string;
	setNote: (next: string) => void;
	error?: string;
	noteError?: string;
}) {
	return (
		<fieldset className="mt-6 flex flex-col gap-3">
			<legend className="text-sm font-medium">Starting prices</legend>
			<p className="text-cocoa-soft text-xs">
				Shown on the product page in place of a price. A line reading &ldquo;6&Prime; &mdash; 2
				layers&rdquo; at 45 comes out as <span className="font-medium">from $45</span>. None of it
				is ever charged: you still price the order yourself once the brief comes in.
			</p>

			<DraftList
				rows={rows}
				setRows={setRows}
				legend="The lines of the guide"
				noun="line"
				max={8}
				error={error}
				blank={() => ({
					key: `guide-${Date.now()}`,
					label: "",
					price: "",
					isAddition: false,
				})}
				labelOf={(row, index) => row.label || `line ${index + 1}`}
				fields={(row, index, update) => (
					<>
						<label className="flex flex-1 flex-col gap-1">
							<span className="text-cocoa-soft text-xs">What it&rsquo;s for</span>
							<Input
								value={row.label}
								placeholder={index === 0 ? '6" — 2 layers' : ""}
								onChange={(event) => update({ label: event.target.value })}
							/>
						</label>

						<label className="flex w-full flex-col gap-1 sm:w-28">
							<span className="text-cocoa-soft text-xs">Price</span>
							<Input
								value={row.price}
								inputMode="decimal"
								placeholder={index === 0 ? "45" : ""}
								onChange={(event) => update({ price: event.target.value })}
							/>
						</label>
					</>
				)}
				body={(row, _index, update) => (
					<Switch
						label="Adds to the others"
						description={
							'Reads as "+ $10" rather than "from $10". For an extra layer or an extra tier — something added to one of the prices above rather than a starting price of its own.'
						}
						checked={row.isAddition}
						onChange={(event) => update({ isAddition: event.target.checked })}
					/>
				)}
			/>

			<label className="flex flex-col gap-1">
				<span className="text-cocoa-soft text-xs">The line underneath (optional)</span>
				<Input
					value={note}
					placeholder="Custom designs and premium flavours may cost extra."
					onChange={(event) => setNote(event.target.value)}
					invalid={Boolean(noteError)}
				/>
				{noteError ? <p className="text-danger text-xs font-medium">{noteError}</p> : null}
			</label>
		</fieldset>
	);
}

/**
 * The option groups this product offers and the options in each — flavours,
 * sizes, layer counts — submitted as one JSON field. Labelled **Variant** and
 * **Options** on screen; see `productOptionGroupSchema` for why the code does
 * not follow the label all the way.
 *
 * Adding one turns the product into something a customer chooses from;
 * removing the last one turns it back into a single thing at the price above.
 * There is no switch to forget to flick.
 *
 * The prices are not here. They belong to whole combinations rather than to any
 * one option, so they live in the grid below, which is generated from whatever
 * is typed here. What lives on an option is what is true of it wherever it
 * turns up: its name, its photo, whether it is on, and what it adds to the
 * allergens. The walnuts are in the carrot cake at every number of layers.
 *
 * The hidden `id` on each row is the existing database row's, and is why this
 * cannot be a plain list of names: it is what a save matches on, so renaming an
 * option edits the row the combinations point at rather than replacing it.
 */
function GroupFieldset({
	slug,
	groups,
	setGroups,
	error,
}: {
	/** Where an option's photo is filed in storage: the product's own folder. */
	slug: string;
	groups: GroupDraft[];
	setGroups: (next: GroupDraft[]) => void;
	error?: string;
}) {
	const update = (index: number, patch: Partial<GroupDraft>) => {
		setGroups(patchItem(groups, index, patch));
	};

	const updateOption = (group: number, option: number, patch: Partial<OptionDraft>) => {
		update(group, { options: patchItem(groups[group]!.options, option, patch) });
	};

	// Rebuilt from ALLERGENS rather than pushed onto, so an option's list is
	// always in the same order as the product's and the chips below it.
	const toggleAllergen = (group: number, option: number, allergen: Allergen, on: boolean) => {
		const current = groups[group]!.options[option]!.allergens;
		updateOption(group, option, {
			allergens: on
				? ALLERGENS.filter((one) => one === allergen || current.includes(one))
				: current.filter((one) => one !== allergen),
		});
	};

	// How many rows the grid would have if this group gained one more option.
	// Three flavours by three layer counts is nine prices to type; the same two
	// groups with ten options each is a hundred, which is not a form any more.
	const roomFor = (group: number) =>
		groups.reduce(
			(total, one, index) => total * (one.options.length + (index === group ? 1 : 0)),
			1,
		);

	return (
		<div className="flex flex-col gap-6">
			{groups.map((group, groupIndex) => {
				const noun = (group.name || "Flavour").toLowerCase();

				return (
					<fieldset
						key={group.key}
						className="border-line flex flex-col gap-4 rounded-md border p-4">
						<legend className="px-1 text-sm font-medium">Variant {groupIndex + 1}</legend>

						<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
							<label className="flex flex-1 flex-col gap-1">
								<span className="text-cocoa-soft text-xs">What the choice is called</span>
								<input
									className="border-line bg-paper focus-visible:border-cocoa w-full rounded-md border px-3 py-2 text-base"
									value={group.name}
									placeholder={groupIndex === 0 ? "e.g. Flavour" : "e.g. Layers"}
									onChange={(event) => update(groupIndex, { name: event.target.value })}
								/>
							</label>

							<button
								type="button"
								onClick={() => setGroups(groups.filter((_, i) => i !== groupIndex))}
								className="border-line hover:border-danger hover:text-danger min-h-11 rounded-md border px-3 text-sm">
								Remove variant
							</button>
						</div>

						<div className="flex flex-col gap-3">
							{group.options.map((option, optionIndex) => (
								<div
									key={option.key}
									className="border-line flex flex-col gap-3 rounded-md border p-3">
									<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
										<ImageUploader
											size="sm"
											slug={slug}
											label={option.name || `this ${noun}`}
											value={option.imagePath}
											onChange={(path) =>
												updateOption(groupIndex, optionIndex, { imagePath: path })
											}
										/>

										<label className="flex flex-[2] flex-col gap-1">
											<span className="text-cocoa-soft text-xs">Name</span>
											<input
												className="border-line bg-paper focus-visible:border-cocoa w-full rounded-md border px-3 py-2 text-base"
												value={option.name}
												placeholder={optionIndex === 0 && groupIndex === 0 ? "e.g. Chocolate" : ""}
												onChange={(event) =>
													updateOption(groupIndex, optionIndex, { name: event.target.value })
												}
											/>
										</label>

										<div className="flex items-center gap-2">
											{/* One option can sell out without the rest of the product
											    going with it, and takes every combination it is part of
											    with it, so availability lives on the row. */}
											<button
												type="button"
												aria-pressed={option.isAvailable}
												onClick={() =>
													updateOption(groupIndex, optionIndex, {
														isAvailable: !option.isAvailable,
													})
												}
												className={cn(
													"rounded-pill min-h-11 border px-3 text-sm font-medium",
													option.isAvailable
														? "bg-mint border-transparent"
														: "border-line text-cocoa-soft",
												)}>
												{option.isAvailable ? "On" : "Sold out"}
											</button>

											<div className="flex">
												<button
													type="button"
													onClick={() =>
														update(groupIndex, {
															options: moveItem(group.options, optionIndex, -1),
														})
													}
													disabled={optionIndex === 0}
													aria-label={`Move ${option.name || noun} up`}
													className="border-line hover:border-cocoa min-h-11 rounded-l-md border px-2.5 text-sm disabled:opacity-40">
													↑
												</button>
												<button
													type="button"
													onClick={() =>
														update(groupIndex, {
															options: moveItem(group.options, optionIndex, 1),
														})
													}
													disabled={optionIndex === group.options.length - 1}
													aria-label={`Move ${option.name || noun} down`}
													className="border-line hover:border-cocoa -ml-px min-h-11 rounded-r-md border px-2.5 text-sm disabled:opacity-40">
													↓
												</button>
											</div>

											<button
												type="button"
												onClick={() =>
													update(groupIndex, {
														options: group.options.filter((_, i) => i !== optionIndex),
													})
												}
												className="border-line hover:border-danger hover:text-danger min-h-11 rounded-md border px-3 text-sm">
												Remove
											</button>
										</div>
									</div>

									{/* Folded away by default. Seven checkboxes on every row would
									    bury the name, and most options add nothing; the summary
									    says what is ticked without opening it. */}
									<details className="border-line border-t pt-3">
										<summary className="text-cocoa-soft cursor-pointer text-xs">
											Extra allergens ·{" "}
											{option.allergens.length > 0
												? `also contains ${allergenSentence(option.allergens)}`
												: "nothing beyond the product's"}
										</summary>
										<div className="mt-3 grid gap-3 sm:grid-cols-3">
											{ALLERGENS.map((allergen) => (
												<Checkbox
													key={allergen}
													label={ALLERGEN_LABELS[allergen]}
													checked={option.allergens.includes(allergen)}
													onChange={(event) =>
														toggleAllergen(groupIndex, optionIndex, allergen, event.target.checked)
													}
												/>
											))}
										</div>
									</details>
								</div>
							))}

							{group.options.length < MAX_OPTIONS && roomFor(groupIndex) <= MAX_COMBINATIONS ? (
								<button
									type="button"
									onClick={() =>
										update(groupIndex, {
											options: [
												...group.options,
												{
													key: `option-new-${Date.now()}`,
													id: "",
													name: "",
													imagePath: "",
													allergens: [],
													isAvailable: true,
												},
											],
										})
									}
									className="border-line hover:border-cocoa rounded-pill w-fit border px-4 py-2 text-sm font-medium">
									Add {group.options.length === 0 ? `a ${noun}` : `another ${noun}`}
								</button>
							) : (
								<p className="text-cocoa-soft text-xs">
									That is as many as fit. Every option here multiplies the prices to type below.
								</p>
							)}
						</div>
					</fieldset>
				);
			})}

			{error ? <p className="text-danger text-xs font-medium">{error}</p> : null}

			{groups.length < MAX_OPTION_GROUPS ? (
				<button
					type="button"
					onClick={() =>
						setGroups([
							...groups,
							{
								key: `group-new-${Date.now()}`,
								id: "",
								name: "",
								options: [
									{
										key: `option-new-${Date.now()}`,
										id: "",
										name: "",
										imagePath: "",
										allergens: [],
										isAvailable: true,
									},
								],
							},
						])
					}
					className="border-line hover:border-cocoa rounded-pill w-fit border px-4 py-2 text-sm font-medium">
					{groups.length === 0 ? "Add a variant" : "Add another variant"}
				</button>
			) : null}
		</div>
	);
}

/**
 * A price for every combination of the options above.
 *
 * Generated rather than typed: the owner says what the groups and options are,
 * and this asks her for the one thing that cannot be worked out from them.
 * Every combination is priced outright — there is no base price with a
 * surcharge per layer — because "Chocolate · 3 layers" costs whatever she
 * decides it costs, and a formula would make that the one thing she could not
 * say.
 *
 * A blank price means she does not sell that one. It is left out of the save
 * rather than stored as zero, so the picker greys it out and nobody can order
 * a three layer lemon she has never made.
 */
function PriceGrid({
	groups,
	combinations,
	cells,
	cellFor,
	setCells,
	savedVariantCount,
	error,
}: {
	groups: GroupDraft[];
	combinations: OptionDraft[][];
	cells: Record<string, CellDraft>;
	/** Reads through `hangCells`, so a price survives a group being added. */
	cellFor: (combination: OptionDraft[]) => CellDraft;
	setCells: (next: Record<string, CellDraft>) => void;
	savedVariantCount: number;
	error?: string;
}) {
	if (combinations.length === 0) {
		return (
			<p className="text-cocoa-soft text-sm">
				Name a variant and at least one option above, and the prices to fill in will appear here.
			</p>
		);
	}

	// Written onto the raw cells rather than onto what `cellFor` reads, so that
	// a price belonging to a combination she is not looking at — one whose option
	// is deleted and not yet put back — is not thrown away by an edit elsewhere
	// in the grid. What it writes is what she sees, inherited price and all.
	const patch = (combination: OptionDraft[], change: Partial<CellDraft>) => {
		const key = cellKey(combination);
		setCells({ ...cells, [key]: { ...EMPTY_CELL, ...cellFor(combination), ...change } });
	};

	const priced = combinations.filter((combination) => cellFor(combination).price.trim() !== "");

	return (
		<fieldset className="flex flex-col gap-3">
			<legend className="text-sm font-medium">Prices</legend>
			<p className="text-cocoa-soft text-xs">
				One price per combination, in dollars. Leave a row blank for a combination you don&rsquo;t
				make — it won&rsquo;t be offered.
			</p>

			{combinations.map((combination) => {
				const cell = cellFor(combination);

				return (
					<div
						key={cellKey(combination)}
						className="border-line flex flex-wrap items-end gap-3 rounded-md border p-3">
						<p className="flex-[2] text-sm font-medium">
							{combination.map((option) => option.name.trim()).join(VARIANT_NAME_SEPARATOR)}
							{combination.some((option) => !option.isAvailable) ? (
								<span className="text-cocoa-soft block text-xs font-normal">
									Sold out while{" "}
									{combination
										.filter((option) => !option.isAvailable)
										.map((option) => option.name.trim())
										.join(" and ")}{" "}
									is off
								</span>
							) : null}
						</p>

						<label className="flex w-28 flex-col gap-1">
							<span className="text-cocoa-soft text-xs">Price ($)</span>
							<input
								inputMode="decimal"
								className="border-line bg-paper focus-visible:border-cocoa w-full rounded-md border px-3 py-2 text-base"
								value={cell.price}
								onChange={(event) => patch(combination, { price: event.target.value })}
							/>
						</label>

						<button
							type="button"
							aria-pressed={cell.isAvailable}
							onClick={() => patch(combination, { isAvailable: !cell.isAvailable })}
							className={cn(
								"rounded-pill min-h-11 border px-3 text-sm font-medium",
								cell.isAvailable ? "bg-mint border-transparent" : "border-line text-cocoa-soft",
							)}>
							{cell.isAvailable ? "On" : "Sold out"}
						</button>
					</div>
				);
			})}

			{error ? <p className="text-danger text-xs font-medium">{error}</p> : null}

			{priced.length === 0 ? (
				<p className="text-cocoa-soft text-xs">
					{savedVariantCount > 0
						? `Nothing is priced, so there is nothing to save. Give at least one combination a price, or turn off "This is sold in variants" to put this back to a single price.`
						: `Nothing is priced yet, so saving now puts this back to a single price with no ${(groups[0]?.name || "flavour").toLowerCase()} to choose.`}
				</p>
			) : null}
		</fieldset>
	);
}

/**
 * Shows what a customer would actually be charged for a few quantities.
 *
 * Bundle pricing is easy to get wrong by a couple of dollars, and the owner
 * should see the answer before saving rather than discovering it on an order.
 *
 * With combinations in play it shows one block per combination, because that is
 * where the surprise lives: a bundle is an outright price for N of a line, so
 * the same "4 for $12" is a bigger discount on the expensive flavour than on the
 * cheap one. Better seen here than worked out from an order.
 */
function PricePreview({
	unitPrice,
	unitLabel,
	qtyStep,
	tiers,
	combinations,
	cellFor,
}: {
	unitPrice: string;
	unitLabel: string;
	qtyStep: string;
	tiers: TierDraft[];
	/** Only the priced ones; the blank rows are combinations she does not sell. */
	combinations: OptionDraft[][];
	cellFor: (combination: OptionDraft[]) => CellDraft;
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

	// One priced column per combination, or a single unnamed one for a plain
	// product.
	const columns =
		combinations.length > 0
			? combinations.map((combination) => {
					const cell = cellFor(combination);
					return {
						name: combination.map((option) => option.name.trim()).join(VARIANT_NAME_SEPARATOR),
						cents: Math.round(Number(cell.price) * 100),
						soldOut: !cell.isAvailable || combination.some((option) => !option.isAvailable),
					};
				})
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
			{combinations.length > 0 ? (
				<p className="text-cocoa-soft text-xs">
					One combination per line. A bundle price buys that many of the same one.
				</p>
			) : null}
		</div>
	);
}
