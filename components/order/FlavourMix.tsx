"use client";

import Image from "next/image";
import { productImageUrl } from "@/lib/images";
import { availableVariants, formatPrice, minOrderQty, priceProductLines } from "@/lib/pricing";
import type { Product, ProductVariant } from "@/lib/types";
import { Stepper } from "@/components/ui/Stepper";

/** How many of each flavour, keyed by variant id. Absent means none. */
export type FlavourCounts = Record<string, number>;

/** One flavour with a count, and the share of the order's price it carries. */
export interface MixLine {
	variant: ProductVariant;
	qty: number;
	totalCents: number;
	/** How that share breaks down, e.g. "2 x $17.50 box of 12 + 1 x $15.00 box of 12". */
	note: string;
}

/**
 * The flavours a customer has actually asked for, priced as one order.
 *
 * Not one flavour at a time. Past the minimum every one is the cheaper rate
 * however the flavours fall, so three boxes is three boxes whether that is
 * three of one or one each of three. Each line still carries a figure of its
 * own, because that is what the basket holds and what `place_order` writes, and
 * the figures add back up to the order's. See `priceProductLines`.
 *
 * In her order, and only the ones with a count, so the caller can treat the
 * length as "how many lines is this about to add".
 */
export function mixLines(
	product: Product,
	counts: FlavourCounts,
	/** How many of this product the basket is already holding. */
	alreadyCounted = 0,
): MixLine[] {
	const chosen = availableVariants(product)
		.map((variant) => ({ variant, qty: counts[variant.id] ?? 0 }))
		.filter((line) => line.qty > 0);

	// Priced together, not one at a time, so that what the page quotes is what
	// the basket will hold: past the minimum every one is the cheaper rate, and
	// which flavour it happens to be does not come into it.
	const priced = priceProductLines(product, chosen, alreadyCounted);

	return chosen.map(({ variant, qty }, index) => ({
		variant,
		qty,
		totalCents: priced[index]!.totalCents,
		note: priced[index]!.note,
	}));
}

/** How many of the product in total, across every flavour picked. */
export function mixQty(lines: readonly MixLine[]): number {
	return lines.reduce((total, line) => total + line.qty, 0);
}

/**
 * Every flavour at once, with a number beside each.
 *
 * The minis are why this exists. A box is one flavour and twenty-four is the
 * smallest order, so the ordinary order is two boxes in two flavours; asking one
 * flavour at a time made that two passes through the page, with nothing on the
 * page saying the second pass existed.
 *
 * Deliberately not a picker. There is no "selected" flavour here and no default:
 * every row starts at zero and the customer fills in the ones they want. That is
 * also why the rows are steppers rather than pills, and why nothing is disabled
 * when the total is short, which the panel says rather than enforces. Whether
 * the basket as a whole reaches the minimum is the basket's question, because
 * this product may already be in it.
 *
 * Sold-out flavours are left out entirely rather than shown at zero, the same
 * way the pill picker leaves them out: the list offers what can be bought.
 */
export function FlavourMix({
	product,
	counts,
	onChange,
	groupName,
	alreadyCounted = 0,
}: {
	product: Product;
	counts: FlavourCounts;
	onChange: (counts: FlavourCounts) => void;
	/** What this product calls them: "Flavour", "Size". */
	groupName: string;
	/**
	 * How many of this product the basket is already holding.
	 *
	 * The cheaper rate is a rule about the order, so a second visit to this page
	 * is already past the minimum and the boxes it adds cost the lower price.
	 * Without this the page would quote the first two all over again.
	 */
	alreadyCounted?: number;
}) {
	const offered = availableVariants(product);
	const lines = mixLines(product, counts, alreadyCounted);
	const total = mixQty(lines);
	const minimum = minOrderQty(product);

	/**
	 * How far up a flavour goes on its first press.
	 *
	 * A combination with a minimum of its own cannot usefully sit at one below
	 * it, so the first press lands on that minimum rather than making someone
	 * press eight times to reach a number the shop would have insisted on. Every
	 * other flavour starts at one step, and the product's own minimum is left
	 * alone here because it is a rule about the total, which the row cannot see.
	 */
	function firstStep(variant: ProductVariant): number {
		return variant.minPerOrder != null
			? minOrderQty(product, variant)
			: Math.max(1, product.qtyStep);
	}

	function set(variant: ProductVariant, next: number) {
		const floor = firstStep(variant);
		// Below its own floor there is no half measure: it is none of that flavour.
		const wanted = next < floor ? 0 : next;
		const { [variant.id]: _gone, ...rest } = counts;
		onChange(wanted > 0 ? { ...rest, [variant.id]: wanted } : rest);
	}

	return (
		<fieldset className="flex flex-col gap-2">
			<legend className="text-cocoa-soft text-2xs mb-2 font-medium tracking-widest uppercase">
				{groupName}
			</legend>

			<p className="text-cocoa-soft mb-1 text-xs">
				How many of each. Every {groupName.toLowerCase()} you pick goes on the order as its own
				line.
			</p>

			<ul className="flex flex-col gap-2">
				{offered.map((variant) => {
					const qty = counts[variant.id] ?? 0;
					const thumbnail = productImageUrl(variant.imagePath ?? product.imagePath);

					return (
						<li
							key={variant.id}
							className="border-line flex flex-wrap items-center gap-3 border-b pb-2 last:border-b-0">
							{thumbnail ? (
								<Image
									src={thumbnail}
									alt=""
									width={64}
									height={64}
									className="size-9 shrink-0 rounded-full object-cover"
								/>
							) : null}

							{/* No price beside the flavour, and that is not an omission. The
							    cheaper rate belongs to the order rather than to any one
							    row, so which rows it lands on is decided by walking them:
							    the same two boxes would read $17.50 here and $15 there
							    depending on what else was picked, which explains nothing
							    and invites the question it looks like it answers. The
							    total underneath is the number that is actually true, and
							    the line under that says how it was reached. */}
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="truncate text-sm font-medium">{variant.name}</span>
							</span>

							<Stepper
								value={qty}
								min={0}
								max={null}
								step={Math.max(1, product.qtyStep)}
								size="sm"
								label={`${product.name}, ${variant.name}`}
								onChange={(next) => {
									// Zero is a real value here and the stepper cannot know that
									// the first press should clear the row rather than land on
									// one; `set` decides both.
									set(variant, next === 0 ? 0 : Math.max(next, firstStep(variant)));
								}}
							/>
						</li>
					);
				})}
			</ul>

			{/* The rule, said once, in the words she uses. The last sentence is the
			    whole of the change 20260918000013 made and the thing a customer
			    filling in this list most wants to know: moving a box from one row
			    to another does not move the price. */}
			{product.extraUnitPriceCents !== null ? (
				<p className="text-cocoa-soft mt-1 text-xs">
					The first {minimum} are {formatPrice(product.unitPriceCents)} each and every one after
					that is {formatPrice(product.extraUnitPriceCents)}. However many {groupName.toLowerCase()}
					s you split them across comes to the same.
				</p>
			) : null}

			{total > 0 && total < minimum ? (
				<p className="text-cocoa-soft mt-1 text-xs">
					That is {total} of {minimum}. Add another {groupName.toLowerCase()}, or more of one you
					have picked, to reach the minimum.
				</p>
			) : null}
		</fieldset>
	);
}
