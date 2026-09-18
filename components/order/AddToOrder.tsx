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
	clampExtraQty,
	extraLabel,
	extraPriceLabel,
	extrasTotalCents,
	formatMoney,
	hasVariants,
	isOptionSelectable,
	isOrderable,
	minOrderQty,
	optionGroups,
	priceProduct,
	variantFor,
} from "@/lib/pricing";
import type { CartExtra, Product } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Stepper } from "@/components/ui/Stepper";
import { BriefFields, EMPTY_BRIEF, isDraftEmpty, type DraftBrief } from "./BriefFields";
import { FlavourMix, mixLines, mixQty, type FlavourCounts } from "./FlavourMix";
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
 * An extra the owner sells several of — candles, a sparkler, a topper — gets a
 * stepper beside its tick, capped at the number she set. Ticking it starts at
 * one, which is the answer for most people, and the picker is there for the
 * sixth birthday. Everything else stays a plain tick: "how many gift boxes" is
 * a question nobody was asking.
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
	// Starts on the minimum for what is showing: the commonest order, and one
	// fewer thing to press. A combination with a minimum of its own is asked
	// about rather than the product, so a whole chiffon cake opens on one where
	// its slices open on eight. The stepper may be taken below it; see `floor`.
	const [qty, setQty] = useState(() => minOrderQty(product, variant));
	// How many of each flavour, when the product is bought as several at once.
	// Empty and unread on everything else; see `mixing` below.
	const [counts, setCounts] = useState<FlavourCounts>({});
	const [added, setAdded] = useState(false);
	const [saving, setSaving] = useState(false);
	// Held as a list rather than a map so the order it is written to the cart in
	// is stable; `add` sorts it anyway, which is what makes two customers picking
	// the same two extras land on the same line. Each entry carries how many of
	// that extra were asked for, which is 1 for everything she sells one of.
	const [chosenExtras, setChosenExtras] = useState<CartExtra[]>([]);
	// The photos here are still files. They are handed to the browser's own photo
	// store on the way into the basket and only leave the browser attached to the
	// order itself. See lib/photo-store.ts.
	const [brief, setBrief] = useState<DraftBrief>(EMPTY_BRIEF);

	// The picker only ever offers what is on sale. An extra switched off between
	// filling the basket and submitting is refused by `place_order` rather than
	// quietly dropped, which is the same promise the flavours make.
	const offered = availableExtras(product.extras);
	// Resolved against the offered list rather than read straight out of state,
	// so the extras come out in her order and each one is paired with the row it
	// was ticked from. `findExtras` is not used here: nothing has been saved yet,
	// so there is no stale id to be tolerant of.
	const chosen = offered
		.map((extra) => ({ extra, qty: chosenExtras.find((pick) => pick.id === extra.id)?.qty }))
		.filter(
			(pick): pick is { extra: (typeof offered)[number]; qty: number } => pick.qty !== undefined,
		);

	/** Ticks an extra on at one, or off; the stepper moves it from there. */
	function toggleExtra(id: string) {
		setChosenExtras((current) =>
			current.some((pick) => pick.id === id)
				? current.filter((pick) => pick.id !== id)
				: [...current, { id, qty: 1 }],
		);
		setAdded(false);
	}

	function setExtraQty(id: string, qty: number) {
		setChosenExtras((current) => current.map((pick) => (pick.id === id ? { ...pick, qty } : pick)));
		setAdded(false);
	}

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

	/**
	 * True when this product is bought as several of its flavours at once.
	 *
	 * Three conditions beyond her switch, and each one is a case the panel has
	 * no answer for. Two option groups means the thing being counted is a
	 * combination rather than a flavour, and the custom cake has a hundred and
	 * sixty of them. No variants means there is no list. Priced on request means
	 * every row would read $0.00, which beside a cake reads as a free cake.
	 */
	const mixing =
		product.mixVariants && !product.priceOnRequest && groups.length === 1 && hasVariants(product);

	// One per flavour asked for, already priced the way the basket will hold it.
	const lines = mixing ? mixLines(product, counts) : [];
	const mixCents = lines.reduce((total, line) => total + line.totalCents, 0);

	// A selection can name a combination the owner never priced — she sells the
	// lemon in two layers and not in three — and the page has to say so rather
	// than quoting the product's own price for something that is not for sale.
	// Mixing has no single selection to be wrong: nothing picked is simply
	// nothing to add yet.
	const picked = mixing ? lines.length > 0 : !hasVariants(product) || variant !== null;
	const menu = mixing || !picked ? null : priceProduct(product, qty, variant);

	// How many of the product this add is for, which is what the extras are
	// priced against: one set of candles per cake, however the cakes were
	// chosen. Mixing spreads that across the flavours rather than changing it.
	const units = mixing ? mixQty(lines) : qty;
	// The running total is what the customer will actually be charged for this
	// line, so the extras belong in it. They are priced per unit, which is why
	// the quantity is passed rather than added on once.
	const extrasCents = extrasTotalCents(chosen, units);

	// The picker starts at the whole product's minimum, because that is what most
	// people are buying and landing on it saves them the presses. It does not
	// *stop* there: a minimum is a rule about the product, met across every
	// flavour, so someone buying twenty-four mini cupcakes as two boxes of twelve
	// in two flavours has to be able to put one box in the basket. The basket
	// counts the lines back together and says so if they do not reach it, and
	// `place_order` counts them the same way inside the transaction.
	const floor = product.qtyStep;
	const minimum = minOrderQty(product, variant);

	/**
	 * Picks an option, and starts the count again when that moves the rule about
	 * how many.
	 *
	 * The chiffon is why. Eight is the minimum for its slices, so the picker
	 * opens on eight; someone who then chooses the whole cake did not mean eight
	 * of those, and was being handed a basket the shop would refuse.
	 *
	 * Only when the minimum itself moves. Swapping one flavour of cupcake for
	 * another leaves a dozen alone, which is much the commoner thing to be doing
	 * and not something to undo under someone's hands.
	 */
	function pick(groupId: string, optionId: string) {
		const next = minOrderQty(product, variantFor(product, { ...selection, [groupId]: optionId }));
		if (next !== minimum) setQty(next);
		choose(groupId, optionId);
		setAdded(false);
	}

	// How the minimum is worded, which turns on what it is a rule about. The
	// product's own spreads across every combination and says so, because a
	// stepper below it otherwise looks like it has forgotten. A combination
	// carrying its own is counted alone, and the same sentence there would be
	// promising something the basket does not do.
	const ownMinimum = variant?.minPerOrder != null;
	const minimumScope = () => {
		if (ownMinimum) {
			return groups.length === 1 ? ` of this ${groups[0]!.name.toLowerCase()}` : " of this one";
		}
		if (groups.length === 1) return `, across every ${groups[0]!.name.toLowerCase()}`;
		return groups.length > 1 ? ", across every combination" : "";
	};
	const reachIt = ownMinimum
		? "Add another to reach it."
		: "Add another flavour, or more of this one, to reach it.";

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
			const extras = chosen.map(({ extra, qty: count }) => ({ id: extra.id, qty: count }));
			const written = isDraftEmpty(brief)
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
					};

			if (mixing) {
				// One line per flavour, which is what the basket holds and what
				// `place_order` prices. Written one at a time because that is the
				// shape of the cart's `add`, and because each call reads the stored
				// cart back before writing, so the four of them accumulate.
				//
				// The brief goes on the first line and only the first. It describes
				// the order of cupcakes rather than any one flavour of them, and
				// copying it would be worse than untidy: photos are uploaded per
				// line and counted per line against the order's cap of six, so the
				// same three pictures on three flavours is nine photos and an order
				// the shop refuses to take.
				lines.forEach((line, index) => {
					add(product.id, line.qty, line.variant.id, extras, index === 0 ? written : undefined);
				});
				setCounts({});
			} else {
				add(product.id, qty, variant?.id ?? null, extras, written);
			}

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
			{mixing ? (
				<FlavourMix
					product={product}
					counts={counts}
					groupName={groups[0]!.name}
					onChange={(next) => {
						setCounts(next);
						setAdded(false);
					}}
				/>
			) : null}

			{mixing
				? null
				: groups.map((group) => (
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
													onChange={() => pick(group.id, option.id)}
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
							const picked = chosenExtras.find((pick) => pick.id === extra.id);
							const ticked = picked !== undefined;
							// She sells more than one of this, so the number is part of the
							// answer and the tick alone cannot give it.
							const countable = extra.maxQty > 1;

							return (
								<div
									key={extra.id}
									className={cn(
										"flex flex-col gap-3 rounded-md border p-3 transition-colors",
										ticked ? "border-cocoa bg-paper-deep" : "border-line hover:border-cocoa",
									)}>
									{/* The label wraps the tick and its text and nothing else.
									    A stepper inside it would toggle the checkbox on every
									    press, because that is what clicking a label does. */}
									<label className="flex cursor-pointer items-start gap-3">
										<input
											type="checkbox"
											checked={ticked}
											className="mt-0.5 size-4 shrink-0 accent-[var(--color-rose-deep)]"
											onChange={() => {
												toggleExtra(extra.id);
											}}
										/>
										<span className="flex flex-1 flex-col gap-0.5">
											<span className="flex items-baseline justify-between gap-3">
												<span className="text-sm font-medium">{extra.name}</span>
												<span className="text-cocoa-soft shrink-0 text-sm">
													{/* "each" is only true when there is more than one to
													    be each of, and a stepped product's floor is never
													    one, so the label follows the quantity. */}
													{extraPriceLabel(extra, { perUnit: units > 1 })}
												</span>
											</span>
											{extra.description ? (
												<span className="text-cocoa-soft text-xs">{extra.description}</span>
											) : null}
										</span>
									</label>

									{/* Only once it is ticked: an untouched product page is a list
									    of things to tick, not a wall of zeroes to read past. */}
									{countable && picked ? (
										<div className="flex flex-wrap items-center gap-3 pl-7">
											<Stepper
												value={picked.qty}
												min={1}
												max={extra.maxQty}
												size="sm"
												label={extra.name}
												onChange={(next) => {
													setExtraQty(extra.id, clampExtraQty(extra, next));
												}}
											/>
											<span className="text-cocoa-soft text-xs">
												{picked.qty === extra.maxQty
													? `${extra.maxQty} is the most I can do`
													: `Up to ${extra.maxQty}`}
												{extra.priceCents > 0
													? `, ${formatMoney(extra.priceCents * picked.qty)}${
															units > 1 ? " each" : ""
														}`
													: ""}
											</span>
										</div>
									) : null}
								</div>
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
				{/* Mixing counts each flavour on its own row, so a stepper here would
				    be a second answer to a question already asked. What is left is
				    the total those rows come to. */}
				{mixing ? null : (
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
				)}
				{mixing && picked ? (
					<p className="font-display text-xl">{formatMoney(mixCents + extrasCents)}</p>
				) : null}
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

			{/* Mixing already shows each flavour's own breakdown on its own row, so
			    all that is left to name here is the extras. With nothing picked
			    there is nothing to break down and no wrong combination to report
			    either, which is the one thing the pill picker has to say. */}
			{mixing && !picked ? null : (
				<p className="text-cocoa-soft text-xs">
					{mixing
						? chosen
								.map(
									({ extra, qty: count }) =>
										`${extraLabel(extra.name, count)} ${formatMoney(extra.priceCents * count * units)}`,
								)
								.join(" + ")
						: menu
							? // The extras are named in the breakdown rather than folded into
								// the menu note, which explains the menu price and nothing else.
								[
									menu.onRequest ? "I'll come back to you with a price" : menu.note,
									...chosen.map(
										({ extra, qty: count }) =>
											`${extraLabel(extra.name, count)} ${formatMoney(extra.priceCents * count * units)}`,
									),
								].join(" + ")
							: "That combination isn't one I make at the moment."}
				</p>
			)}

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

			{/* Nothing to say where the minimum is one step: "at least 1 per order"
			    is a rule about nothing. That is what a whole cake sold beside
			    slices comes to, and it is the one the customer is least likely to
			    want a sentence about. */}
			{/* The flavour list says this itself, against the total across its own
			    rows, which is the number the rule is actually about. Saying it
			    twice on one page is saying it once too often. */}
			{minimum > floor && !mixing ? (
				<p className="text-cocoa-soft text-xs">
					At least {minimum} per order{minimumScope()}.
					{/* Said out loud now that the picker will let them go under it.
					    Without it, a stepper sitting on 1 looks like it has forgotten. */}
					{qty < minimum ? ` ${reachIt}` : ""}
				</p>
			) : null}
		</div>
	);
}
