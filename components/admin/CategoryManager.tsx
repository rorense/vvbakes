"use client";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import { saveCategory } from "@/app/admin/(dashboard)/actions";
import { EMPTY_FORM_STATE, errorFrom, fieldErrorsFrom } from "@/lib/action-state";
import { cn } from "@/lib/cn";
import { slugify } from "@/lib/validation";
import { ACCENTS, type Accent, type Category } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, FormError, Input, Select } from "@/components/ui/Form";
import { AdminCard, EmptyState } from "./AdminShell";

const SWATCH: Record<Accent, string> = {
	rose: "bg-rose",
	blush: "bg-blush",
	butter: "bg-butter",
	mint: "bg-mint",
	peach: "bg-peach",
};

export function CategoryManager({
	categories,
	counts,
	onMove,
	onDelete,
}: {
	categories: Category[];
	counts: Record<string, number>;
	onMove: (id: string, direction: "up" | "down") => Promise<void>;
	onDelete: (id: string) => Promise<void>;
}) {
	const [editing, setEditing] = useState<Category | null>(null);
	const [adding, setAdding] = useState(false);

	const closeEditor = useCallback(() => {
		setEditing(null);
		setAdding(false);
	}, []);

	return (
		<div className="flex flex-col gap-6">
			{categories.length === 0 ? (
				<EmptyState>No categories yet. Add one below to start the shop off.</EmptyState>
			) : (
				<ul className="hairline-list">
					{categories.map((category, index) => (
						<CategoryRow
							key={category.id}
							category={category}
							productCount={counts[category.id] ?? 0}
							isFirst={index === 0}
							isLast={index === categories.length - 1}
							onEdit={() => {
								setAdding(false);
								setEditing(category);
							}}
							onMove={onMove}
							onDelete={onDelete}
						/>
					))}
				</ul>
			)}

			{editing ? (
				<AdminCard title={`Edit ${editing.name}`}>
					<CategoryForm
						key={editing.id}
						category={editing}
						onDone={closeEditor}
					/>
				</AdminCard>
			) : adding ? (
				<AdminCard title="New category">
					<CategoryForm
						key="new"
						category={null}
						onDone={closeEditor}
					/>
				</AdminCard>
			) : (
				<div>
					<Button
						onClick={() => {
							setEditing(null);
							setAdding(true);
						}}>
						Add category
					</Button>
				</div>
			)}
		</div>
	);
}

function CategoryRow({
	category,
	productCount,
	isFirst,
	isLast,
	onEdit,
	onMove,
	onDelete,
}: {
	category: Category;
	productCount: number;
	isFirst: boolean;
	isLast: boolean;
	onEdit: () => void;
	onMove: (id: string, direction: "up" | "down") => Promise<void>;
	onDelete: (id: string) => Promise<void>;
}) {
	const [pending, startTransition] = useTransition();
	const [confirming, setConfirming] = useState(false);
	const chip = "rounded-pill border px-2.5 py-1 text-2xs font-medium";

	return (
		<li className={cn("flex items-center justify-between gap-4 py-4", pending && "opacity-60")}>
			<div className="flex min-w-0 items-center gap-3">
				<span
					className={cn("border-line size-8 shrink-0 rounded-md border", SWATCH[category.accent])}
					aria-hidden="true"
				/>
				<div className="flex min-w-0 flex-col gap-0.5">
					<span className="truncate font-medium">{category.name}</span>
					<span className="text-cocoa-soft text-xs">
						{productCount} {productCount === 1 ? "product" : "products"}
					</span>
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-1.5">
				<button
					type="button"
					disabled={pending || isFirst}
					onClick={() => startTransition(() => onMove(category.id, "up"))}
					className="border-line hover:border-cocoa tap-safe grid size-8 place-content-center rounded-md border text-sm disabled:opacity-30"
					aria-label={`Move ${category.name} up`}>
					<span aria-hidden="true">↑</span>
				</button>
				<button
					type="button"
					disabled={pending || isLast}
					onClick={() => startTransition(() => onMove(category.id, "down"))}
					className="border-line hover:border-cocoa tap-safe grid size-8 place-content-center rounded-md border text-sm disabled:opacity-30"
					aria-label={`Move ${category.name} down`}>
					<span aria-hidden="true">↓</span>
				</button>
				<button
					type="button"
					onClick={onEdit}
					className={cn(chip, "border-line hover:border-cocoa")}>
					Edit
				</button>

				{/* Deleting a category would orphan its products out of the shop, so
				    it is only offered once the category is empty. */}
				{productCount === 0 ? (
					confirming ? (
						<>
							<button
								type="button"
								disabled={pending}
								onClick={() => startTransition(() => onDelete(category.id))}
								className={cn(chip, "border-danger text-danger")}>
								Delete
							</button>
							<button
								type="button"
								onClick={() => setConfirming(false)}
								className={cn(chip, "border-line text-cocoa-soft")}>
								Keep
							</button>
						</>
					) : (
						<button
							type="button"
							onClick={() => setConfirming(true)}
							className={cn(chip, "border-line text-cocoa-soft hover:border-danger")}>
							Delete
						</button>
					)
				) : null}
			</div>
		</li>
	);
}

function CategoryForm({ category, onDone }: { category: Category | null; onDone: () => void }) {
	const [state, action, pending] = useActionState(saveCategory, EMPTY_FORM_STATE);
	const errors = fieldErrorsFrom(state);
	const error = errorFrom(state);

	const [name, setName] = useState(category?.name ?? "");
	const [slug, setSlug] = useState(category?.slug ?? "");
	const [slugTouched, setSlugTouched] = useState(Boolean(category));
	const slugValue = slugTouched ? slug : slugify(name);

	// The action revalidates the page, so a successful save re-renders the list
	// underneath us; closing the form is what makes that visible.
	const saved = state.result?.ok === true;
	useEffect(() => {
		if (saved) onDone();
	}, [saved, onDone]);

	return (
		<form
			action={action}
			className="flex flex-col gap-5">
			{category ? (
				<input
					type="hidden"
					name="id"
					value={category.id}
				/>
			) : null}
			<input
				type="hidden"
				name="sortOrder"
				value={category?.sortOrder ?? 999}
			/>

			<div className="grid gap-5 sm:grid-cols-3">
				<Field
					label="Name"
					required
					error={errors.name}>
					{(props) => (
						<Input
							{...props}
							name="name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							invalid={Boolean(errors.name)}
						/>
					)}
				</Field>

				<Field
					label="Web address"
					hint={`/shop#${slugValue || "…"}`}
					required
					error={errors.slug}>
					{(props) => (
						<Input
							{...props}
							name="slug"
							value={slugValue}
							onChange={(event) => {
								setSlugTouched(true);
								setSlug(slugify(event.target.value));
							}}
							invalid={Boolean(errors.slug)}
						/>
					)}
				</Field>

				<Field
					label="Colour"
					hint="The band this category gets in the shop."
					error={errors.accent}>
					{(props) => (
						<Select
							{...props}
							name="accent"
							defaultValue={category?.accent ?? "rose"}>
							{ACCENTS.map((accent) => (
								<option
									key={accent}
									value={accent}>
									{accent}
								</option>
							))}
						</Select>
					)}
				</Field>
			</div>

			{error ? <FormError>{error}</FormError> : null}

			<div className="flex items-center gap-3">
				<Button
					type="submit"
					disabled={pending}>
					{pending ? "Saving…" : category ? "Save changes" : "Add category"}
				</Button>
				<button
					type="button"
					onClick={onDone}
					className="text-cocoa-soft hover:text-cocoa text-sm underline underline-offset-4">
					Cancel
				</button>
			</div>
		</form>
	);
}
