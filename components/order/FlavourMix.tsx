"use client";

import Image from "next/image";
import { productImageUrl } from "@/lib/images";
import {
	availableVariants,
	formatMoney,
	formatPrice,
	minOrderQty,
	priceProduct,
} from "@/lib/pricing";
import type { Product, ProductVariant } from "@/lib/types";
import { Stepper } from "@/components/ui/Stepper";

/** How many of each flavour, keyed by variant id. Absent means none. */
export type FlavourCounts = Record<string, number>;

/** One flavour with a count, and what that many of it comes to. */
export interface MixLine {
	variant: ProductVariant;
	qty: number;
	totalCents: number;
	/** How that total breaks down, e.g. "1 x 2 for $35.00 + 1 x $15.00 box of 12". */
	note: string;
}

/**
 * The flavours a customer has actually asked for, priced.
 *
 * Priced one flavour at a time, because that is what the basket will hold and
 * what `place_order` will charge: a line is one flavour, and a price for N of
 * this product is a price for N of one of them. See `Product.extraUnitPriceCents`.
 *
 * In her order, and only the ones with a count, so the caller can treat the
 * length as "how many lines is this about to add".
 */
export function mixLines(product: Product, counts: FlavourCounts): MixLine[] {
	return availableVariants(product)
		.map((variant) => ({ variant, qty: counts[variant.id] ?? 0 }))
		.filter((line) => line.qty > 0)
		.map(({ variant, qty }) => {
			const priced = priceProduct(product, qty, variant);
			return { variant, qty, totalCents: priced.totalCents, note: priced.note };
		});
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
}: {
	product: Product;
	counts: FlavourCounts;
	onChange: (counts: FlavourCounts) => void;
	/** What this product calls them: "Flavour", "Size". */
	groupName: string;
}) {
	const offered = availableVariants(product);
	const lines = mixLines(product, counts);
	const total = mixQty(lines);
	const minimum = minOrderQty(product);

	/**
	 * What mixing costs over buying the same number of one flavour, or zero.
	 *
	 * Measured against the cheapest of the flavours actually picked, because
	 * that is the comparison a customer could act on: it is the number they
	 * would save by putting everything on one row. Flavours they did not pick
	 * are not an option they were weighing.
	 *
	 * Zero for most baskets, including every basket that has not passed the
	 * minimum on any one row, which is the ordinary two boxes in two flavours.
	 */
	const surcharge =
		lines.length > 1
			? lines.reduce((total, line) => total + line.totalCents, 0) -
				Math.min(
					...lines.map((line) => priceProduct(product, mixQty(lines), line.variant).totalCents),
				)
			: 0;

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
					// Only once it is being ordered. An untouched page is a list of
					// flavours to choose from, not a column of $0.00 to read past.
					const priced = qty > 0 ? priceProduct(product, qty, variant) : null;

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

							<span className="flex min-w-0 flex-1 flex-col">
								<span className="truncate text-sm font-medium">{variant.name}</span>
								{priced && !priced.onRequest ? (
									<span className="text-cocoa-soft text-xs">{priced.note}</span>
								) : null}
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

							<span className="w-20 shrink-0 text-right text-sm tabular-nums">
								{priced && !priced.onRequest ? formatMoney(priced.totalCents) : ""}
							</span>
						</li>
					);
				})}
			</ul>

			{/* The one place the per-line rule is visible as a number, so it is the
			    one place it has to be said: a customer watching the total move as
			    they shift a box from one flavour to another deserves to know why.

			    Said only when it is true, which is not the same as "two flavours
			    are picked". Two boxes in two flavours comes to exactly what two of
			    one comes to, because neither line has passed the first two yet;
			    warning there would be charging someone's attention for nothing and
			    would be wrong besides. So the split is priced against the best the
			    same number could have cost as a single flavour, and the sentence
			    appears with that difference in it or not at all. */}
			{surcharge > 0 ? (
				<p className="text-cocoa-soft mt-1 text-xs">
					Mixing comes to {formatMoney(surcharge)} more than {total} of one{" "}
					{groupName.toLowerCase()}, because the first {minimum} of each are{" "}
					{formatPrice(product.unitPriceCents)} and it is{" "}
					{formatPrice(product.extraUnitPriceCents ?? product.unitPriceCents)} each after that.
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
