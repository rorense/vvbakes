"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { optionGroups } from "@/lib/pricing";
import type { Product } from "@/lib/types";
import { ReorderButtons } from "./AdminShell";

/**
 * What this product asks for, in a few words: "3 flavours" for one question,
 * "3 flavours × 3 layers" for two. The grid this describes is what the owner
 * has to fill in, so the shape of it is more use at a glance than a count of
 * the rows it came to.
 */
function variantSummary(product: Product): string {
	return optionGroups(product)
		.map((group) => {
			const noun = group.name.toLowerCase();
			return `${group.options.length} ${noun}${group.options.length === 1 ? "" : "s"}`;
		})
		.join(" × ");
}

/**
 * One row of the product list, with the controls the owner actually reaches for:
 * availability, featured, order, and a way in to the full form.
 *
 * The actions are passed in from the server component rather than imported, so
 * this stays a dumb client component and all the authorisation stays server-side.
 */
export function ProductRow({
	product,
	categoryName,
	priceLabel,
	isFirst,
	isLast,
	onMove,
	onToggle,
	onDelete,
}: {
	product: Product;
	categoryName: string | null;
	priceLabel: string;
	isFirst: boolean;
	isLast: boolean;
	onMove: (id: string, direction: "up" | "down") => Promise<void>;
	onToggle: (id: string, field: "is_available" | "is_featured", value: boolean) => Promise<void>;
	onDelete: (id: string) => Promise<void>;
}) {
	const [pending, startTransition] = useTransition();
	const [confirmingDelete, setConfirmingDelete] = useState(false);

	const chip =
		"rounded-pill border px-2.5 py-1 text-2xs font-medium transition-colors disabled:opacity-50";

	return (
		<li className={cn("flex flex-col gap-3 py-4", pending && "opacity-60")}>
			<div className="flex items-start justify-between gap-4">
				<div className="flex min-w-0 flex-col gap-0.5">
					<Link
						href={`/admin/products/${product.id}`}
						className="font-medium hover:underline">
						{product.name}
					</Link>
					<p className="text-cocoa-soft text-xs">
						{categoryName ?? "No category"} · {priceLabel}
						{product.qtyStep > 1 ? ` · sold in ${product.qtyStep}s` : ""}
						{product.variants.length > 0 ? ` · ${variantSummary(product)}` : ""}
					</p>
				</div>

				<ReorderButtons
					label={product.name}
					disabled={pending}
					isFirst={isFirst}
					isLast={isLast}
					onMove={(direction) => startTransition(() => onMove(product.id, direction))}
				/>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					disabled={pending}
					aria-pressed={product.isAvailable}
					onClick={() =>
						startTransition(() => onToggle(product.id, "is_available", !product.isAvailable))
					}
					className={cn(
						chip,
						product.isAvailable ? "bg-mint border-transparent" : "border-line text-cocoa-soft",
					)}>
					{product.isAvailable ? "Available" : "Sold out"}
				</button>

				<button
					type="button"
					disabled={pending}
					aria-pressed={product.isFeatured}
					onClick={() =>
						startTransition(() => onToggle(product.id, "is_featured", !product.isFeatured))
					}
					className={cn(
						chip,
						product.isFeatured ? "bg-rose border-transparent" : "border-line text-cocoa-soft",
					)}>
					{product.isFeatured ? "On the home page" : "Not featured"}
				</button>

				<Link
					href={`/admin/products/${product.id}`}
					className={cn(chip, "border-line hover:border-cocoa")}>
					Edit
				</Link>

				{confirmingDelete ? (
					<span className="flex items-center gap-2">
						<button
							type="button"
							disabled={pending}
							onClick={() => startTransition(() => onDelete(product.id))}
							className={cn(chip, "border-danger text-danger")}>
							Delete for good
						</button>
						<button
							type="button"
							onClick={() => setConfirmingDelete(false)}
							className={cn(chip, "border-line text-cocoa-soft")}>
							Keep
						</button>
					</span>
				) : (
					<button
						type="button"
						onClick={() => setConfirmingDelete(true)}
						className={cn(chip, "border-line text-cocoa-soft hover:border-danger")}>
						Delete
					</button>
				)}
			</div>
		</li>
	);
}
