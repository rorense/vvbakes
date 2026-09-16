"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { cn } from "@/lib/cn";
import { productImageUrl } from "@/lib/images";
import { savePhotos } from "@/lib/photo-store";
import {
	availableExtras,
	extraPriceLabel,
	extrasTotalCents,
	formatMoney,
	hasVariants,
	isOptionSelectable,
	isOrderable,
	minOrderQty,
	optionGroups,
	priceProduct,
} from "@/lib/pricing";
import type { Product } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Stepper } from "@/components/ui/Stepper";
import { BriefFields, EMPTY_BRIEF, isDraftEmpty, type DraftBrief } from "./BriefFields";
import { useVariantChoice } from "./VariantChoice";

/**
 * Quantity picker plus "add to order" on a product page. Writes to the
 * localStorage cart and confirms inline rather than navigating away, so someone
 * adding three things does not have to walk back to the shop twice.
 *
 * A product with variants is picked from one group at a time — one picker per
 * group, so a cake asks for a flavour and then for a number of layers rather
 * than for one of nine mashed-together names. The options resolve to a single
 * combination, which is what carries the price and what goes in the basket,
 * because two combinations of one cake are two lines with two prices. Changing
 * any of them resets the "Added." note rather than silently moving the last
 * thing added.
 *
 * The extras come last and are a different kind of choice: not "which one of
 * these" but "any of these as well", so they are checkboxes rather than a
 * radio group, and they are the same list on every product. They are part of
 * what makes a basket line its own line, so the same cake with candles and
 * without are two lines at two prices.
 *
 * The brief comes after all of it, and is the reason a custom cake can be a
 * product at all: it is where someone says what they actually want. It is part
 * of the line too, and more strongly than the extras are — two cakes described
 * differently are two cakes however alike the rest of the line looks.
 */
export function AddToOrder({ product }: { product: Product }) {
	const { add } = useCart();
	const groups = optionGroups(product);
	const { selection, variant, choose } = useVariantChoice(product);
	const [qty, setQty] = useState(() => minOrderQty(product));
	const [added, setAdded] = useState(false);
	const [saving, setSaving] = useState(false);
	// Held as a list rather than a set so the order it is written to the cart in
	// is stable; `add` sorts it anyway, which is what makes two customers picking
	// the same two extras land on the same line.
	const [chosenExtraIds, setChosenExtraIds] = useState<string[]>([]);
	// The photos here are still files. They are handed to the browser's own photo
	// store on the way into the basket and only leave the browser attached to the
	// order itself. See lib/photo-store.ts.
	const [brief, setBrief] = useState<DraftBrief>(EMPTY_BRIEF);

	// The picker only ever offers what is on sale. An extra switched off between
	// filling the basket and submitting is refused by `place_order` rather than
	// quietly dropped, which is the same promise the flavours make.
	const offered = availableExtras(product.extras);
	const chosen = offered.filter((extra) => chosenExtraIds.includes(extra.id));

	if (!isOrderable(product)) {
		return (
			<div className="border-line bg-paper-deep flex flex-col gap-2 rounded-md border p-4">
				<p className="text-sm font-medium">{product.availabilityNote ?? "Sold out for now"}</p>
				<p className="text-cocoa-soft text-sm">
					Follow along on Instagram and I&rsquo;ll post when it&rsquo;s back.
				</p>
			</div>
		);
	}

	// A selection can name a combination the owner never priced — she sells the
	// lemon in two layers and not in three — and the page has to say so rather
	// than quoting the product's own price for something that is not for sale.
	const picked = !hasVariants(product) || variant !== null;
	const menu = picked ? priceProduct(product, qty, variant) : null;
	// The running total is what the customer will actually be charged for this
	// line, so the extras belong in it. They are priced per unit, which is why
	// the quantity is passed rather than added on once.
	const extrasCents = extrasTotalCents(chosen, qty);

	// The floor for this picker is the whole product's minimum, not one step.
	// Someone splitting six cupcakes across two flavours does it in the basket,
	// where the lines can be counted together; starting at three here would just
	// be an order the database refuses.
	const floor = minOrderQty(product);

	/**
	 * Puts this line in the basket, photos and all.
	 *
	 * The photos go to the browser's own store first and the line carries their
	 * ids, because the cart is localStorage and a file will not fit in it. A
	 * store that refused to keep them hands back no ids, and the line goes in
	 * anyway carrying whatever words were typed: a brief without its pictures is
	 * still a brief, and losing the cake over it would be the worse failure.
	 *
	 * The picker is reset afterwards rather than left as it was, so that adding a
	 * second cake starts from a blank brief instead of quietly attaching the
	 * first one's to it.
	 */
	async function addLine() {
		setSaving(true);
		try {
			const photoIds = await savePhotos(brief.photos.map((photo) => photo.file));

			add(
				product.id,
				qty,
				variant?.id ?? null,
				chosen.map((extra) => extra.id),
				isDraftEmpty(brief)
					? undefined
					: {
							note: brief.note,
							inspirationUrl: brief.inspirationUrl,
							photoIds,
							customFlavour: brief.customFlavour,
							// The tick and the text are one answer; `normaliseBrief` drops
							// whichever of them the other one wins over, so both are handed
							// over as they stand rather than reconciled twice.
							frosting: brief.frosting,
							frostingMatchesFlavour: brief.frostingMatchesFlavour,
						},
			);

			// The previews belong to this picker and nothing else will ever draw
			// them; the basket makes its own from the stored blobs.
			for (const photo of brief.photos) URL.revokeObjectURL(photo.preview);
			setBrief(EMPTY_BRIEF);
			setAdded(true);
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="flex flex-col gap-4">
			{groups.map((group) => (
				<fieldset
					key={group.id || group.name}
					className="flex flex-col gap-2">
					<legend className="text-cocoa-soft text-2xs mb-2 font-medium tracking-widest uppercase">
						{group.name}
					</legend>
					<div className="flex flex-wrap gap-2">
						{group.options
							// A sold-out option is left out rather than shown struck through:
							// the picker offers what can be bought, and the product's own
							// "sold out" note covers the case where that is nothing.
							.filter((option) => option.isAvailable)
							.map((option) => {
								const thumbnail = productImageUrl(option.imagePath);
								const chosen = selection[group.id] === option.id;
								// Greyed rather than hidden: a lemon that only comes in two
								// layers should still show three, so the reason the choice is
								// missing is visible instead of the choice being missing.
								const selectable = isOptionSelectable(product, selection, group.id, option.id);

								return (
									<label
										key={option.id}
										className={cn(
											"rounded-pill flex items-center border text-sm transition-colors",
											// A pill with a photo in it is tighter on the left, so the
											// image sits flush inside the rounded end rather than
											// floating in a gap of its own.
											thumbnail ? "gap-2 py-1 pr-4 pl-1" : "px-4 py-2",
											chosen
												? "border-cocoa bg-paper-deep font-medium"
												: "border-line hover:border-cocoa",
											selectable
												? "cursor-pointer"
												: "text-cocoa-soft cursor-not-allowed opacity-50",
										)}>
										<input
											type="radio"
											name={`option-${group.id || group.name}`}
											className="sr-only"
											checked={chosen}
											disabled={!selectable}
											onChange={() => {
												choose(group.id, option.id);
												setAdded(false);
											}}
										/>
										{thumbnail ? (
											<Image
												src={thumbnail}
												alt=""
												width={64}
												height={64}
												className="size-7 shrink-0 rounded-full object-cover"
											/>
										) : null}
										{option.name}
									</label>
								);
							})}
					</div>
				</fieldset>
			))}

			{offered.length > 0 ? (
				<fieldset className="flex flex-col gap-2">
					<legend className="text-cocoa-soft text-2xs mb-2 font-medium tracking-widest uppercase">
						Add extras
					</legend>
					<div className="flex flex-col gap-2">
						{offered.map((extra) => {
							const ticked = chosenExtraIds.includes(extra.id);

							return (
								<label
									key={extra.id}
									className={cn(
										"flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
										ticked ? "border-cocoa bg-paper-deep" : "border-line hover:border-cocoa",
									)}>
									<input
										type="checkbox"
										checked={ticked}
										className="mt-0.5 size-4 shrink-0 accent-[var(--color-rose-deep)]"
										onChange={() => {
											setChosenExtraIds((current) =>
												current.includes(extra.id)
													? current.filter((id) => id !== extra.id)
													: [...current, extra.id],
											);
											setAdded(false);
										}}
									/>
									<span className="flex flex-1 flex-col gap-0.5">
										<span className="flex items-baseline justify-between gap-3">
											<span className="text-sm font-medium">{extra.name}</span>
											<span className="text-cocoa-soft shrink-0 text-sm">
												{/* "each" is only true when there is more than one to
												    be each of, and a stepped product's floor is never
												    one, so the label follows the quantity. */}
												{extraPriceLabel(extra, { perUnit: qty > 1 })}
											</span>
										</span>
										{extra.description ? (
											<span className="text-cocoa-soft text-xs">{extra.description}</span>
										) : null}
									</span>
								</label>
							);
						})}
					</div>
				</fieldset>
			) : null}

			<BriefFields
				product={product}
				value={brief}
				onChange={(next) => {
					setBrief(next);
					setAdded(false);
				}}
			/>

			<div className="flex flex-wrap items-center gap-4">
				<Stepper
					value={qty}
					min={floor}
					max={null}
					step={product.qtyStep}
					label={variant ? `${product.name}, ${variant.name}` : product.name}
					onChange={(next) => {
						setQty(Math.max(floor, next));
						setAdded(false);
					}}
				/>
				{menu ? (
					// A cake with no price yet still has priced extras on it, so the
					// two cases are a sentence and a number rather than one number that
					// would have to read "$0.00" for the cake itself.
					menu.onRequest ? (
						<p className="text-cocoa-soft text-sm">
							{extrasCents > 0
								? `${menu.note}, plus ${formatMoney(extrasCents)} of extras`
								: menu.note}
						</p>
					) : (
						<p className="font-display text-xl">{formatMoney(menu.totalCents + extrasCents)}</p>
					)
				) : null}
			</div>

			<p className="text-cocoa-soft text-xs">
				{menu
					? // The extras are named in the breakdown rather than folded into the
						// menu note, which explains the menu price and nothing else.
						[
							menu.onRequest ? "I'll come back to you with a price" : menu.note,
							...chosen.map((extra) => `${extra.name} ${formatMoney(extra.priceCents * qty)}`),
						].join(" + ")
					: "That combination isn't one I make at the moment."}
			</p>

			<div className="flex flex-wrap items-center gap-3">
				<Button
					size="lg"
					disabled={!picked || saving}
					onClick={() => {
						void addLine();
					}}>
					{saving ? "Adding…" : "Add to order"}
				</Button>

				{added ? (
					<p
						role="status"
						className="text-sm">
						Added.{" "}
						<Link
							href="/order"
							className="font-medium underline underline-offset-4">
							Go to your order
						</Link>
					</p>
				) : null}
			</div>

			{product.minPerOrder !== null ? (
				<p className="text-cocoa-soft text-xs">
					At least {floor} per order
					{groups.length === 1 ? `, across every ${groups[0]!.name.toLowerCase()}` : ""}
					{groups.length > 1 ? ", across every combination" : ""}.
				</p>
			) : null}
		</div>
	);
}
