"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { cn } from "@/lib/cn";
import { productImageUrl } from "@/lib/images";
import {
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
import { useVariantChoice } from "./VariantChoice";

/**
 * Quantity picker plus "add to order" on a product page. Writes to the
 * localStorage cart and confirms inline rather than navigating away, so someone
 * adding three things does not have to walk back to the shop twice.
 *
 * A product with variants answers its questions first — one picker per
 * question, so a cake asks for a flavour and then for a number of layers rather
 * than for one of nine mashed-together names. The answers resolve to a single
 * combination, which is what carries the price and what goes in the basket,
 * because two combinations of one cake are two lines with two prices. Changing
 * any of them resets the "Added." note rather than silently moving the last
 * thing added.
 */
export function AddToOrder({ product }: { product: Product }) {
	const { add } = useCart();
	const groups = optionGroups(product);
	const { selection, variant, choose } = useVariantChoice(product);
	const [qty, setQty] = useState(() => minOrderQty(product));
	const [added, setAdded] = useState(false);

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
	const line = picked ? priceProduct(product, qty, variant) : null;

	// The floor for this picker is the whole product's minimum, not one step.
	// Someone splitting six cupcakes across two flavours does it in the basket,
	// where the lines can be counted together; starting at three here would just
	// be an order the database refuses.
	const floor = minOrderQty(product);

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
							// A sold-out answer is left out rather than shown struck through:
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
				{line ? <p className="font-display text-xl">{formatMoney(line.totalCents)}</p> : null}
			</div>

			<p className="text-cocoa-soft text-xs">
				{line ? line.note : "That combination isn't one I make at the moment."}
			</p>

			<div className="flex flex-wrap items-center gap-3">
				<Button
					size="lg"
					disabled={!picked}
					onClick={() => {
						add(product.id, qty, variant?.id ?? null);
						setAdded(true);
					}}>
					Add to order
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
