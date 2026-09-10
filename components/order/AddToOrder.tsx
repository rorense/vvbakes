"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { minQty, priceProduct } from "@/lib/pricing";
import { formatMoney } from "@/lib/pricing";
import type { Product } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Stepper } from "@/components/ui/Stepper";

/**
 * Quantity picker plus "add to order" on a product page. Writes to the
 * localStorage cart and confirms inline rather than navigating away, so someone
 * adding three things does not have to walk back to the shop twice.
 */
export function AddToOrder({ product }: { product: Product }) {
	const { add } = useCart();
	const [qty, setQty] = useState(() => minQty(product));
	const [added, setAdded] = useState(false);

	if (!product.isAvailable) {
		return (
			<div className="border-line bg-paper-deep flex flex-col gap-2 rounded-md border p-4">
				<p className="text-sm font-medium">{product.availabilityNote ?? "Sold out for now"}</p>
				<p className="text-cocoa-soft text-sm">
					Follow along on Instagram and we&rsquo;ll post when it&rsquo;s back.
				</p>
			</div>
		);
	}

	const line = priceProduct(product, qty);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-4">
				<Stepper
					value={qty}
					min={minQty(product)}
					max={product.maxPerOrder}
					step={product.qtyStep}
					label={product.name}
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
						add(product.id, qty);
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
				<p className="text-cocoa-soft text-xs">Up to {product.maxPerOrder} per order.</p>
			) : null}
		</div>
	);
}
