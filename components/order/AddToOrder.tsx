"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { cn } from "@/lib/cn";
import {
	availableVariants,
	defaultVariant,
	formatMoney,
	isOrderable,
	minQty,
	priceProduct,
} from "@/lib/pricing";
import type { Product, ProductVariant } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Stepper } from "@/components/ui/Stepper";

/**
 * Quantity picker plus "add to order" on a product page. Writes to the
 * localStorage cart and confirms inline rather than navigating away, so someone
 * adding three things does not have to walk back to the shop twice.
 *
 * A product with variants picks one first. The choice is part of what goes in
 * the basket, because two flavours of one cake are two lines with two prices,
 * so changing it resets the "Added." note rather than silently moving the last
 * thing added.
 */
export function AddToOrder({ product }: { product: Product }) {
	const { add } = useCart();
	const choices = availableVariants(product);
	const [variant, setVariant] = useState<ProductVariant | null>(() => defaultVariant(product));
	const [qty, setQty] = useState(() => minQty(product));
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

	const line = priceProduct(product, qty, variant);

	return (
		<div className="flex flex-col gap-4">
			{choices.length > 0 ? (
				<fieldset className="flex flex-col gap-2">
					<legend className="text-cocoa-soft text-2xs mb-2 font-medium tracking-widest uppercase">
						{product.variantLabel}
					</legend>
					<div className="flex flex-wrap gap-2">
						{choices.map((choice) => (
							<label
								key={choice.id}
								className={cn(
									"rounded-pill cursor-pointer border px-4 py-2 text-sm transition-colors",
									choice.id === variant?.id
										? "border-cocoa bg-paper-deep font-medium"
										: "border-line hover:border-cocoa",
								)}>
								<input
									type="radio"
									name="variant"
									className="sr-only"
									checked={choice.id === variant?.id}
									onChange={() => {
										setVariant(choice);
										setAdded(false);
									}}
								/>
								{choice.name}
							</label>
						))}
					</div>
				</fieldset>
			) : null}

			<div className="flex flex-wrap items-center gap-4">
				<Stepper
					value={qty}
					min={minQty(product)}
					max={product.maxPerOrder}
					step={product.qtyStep}
					label={variant ? `${product.name}, ${variant.name}` : product.name}
					onChange={(next) => {
						setQty(Math.max(minQty(product), next));
						setAdded(false);
					}}
				/>
				<p className="font-display text-xl">{formatMoney(line.totalCents)}</p>
			</div>

			<p className="text-cocoa-soft text-xs">{line.note}</p>

			<div className="flex flex-wrap items-center gap-3">
				<Button
					size="lg"
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

			{product.maxPerOrder !== null ? (
				<p className="text-cocoa-soft text-xs">
					Up to {product.maxPerOrder} per order
					{choices.length > 0 ? `, across every ${product.variantLabel.toLowerCase()}` : ""}.
				</p>
			) : null}
		</div>
	);
}
