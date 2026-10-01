"use client";

import { useActionState, useId, useState } from "react";
import { saveOrderItems } from "@/app/admin/(dashboard)/orders/actions";
import { EMPTY_FORM_STATE, errorFrom } from "@/lib/action-state";
import { Button } from "@/components/ui/Button";
import { FormError, Input } from "@/components/ui/Form";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { useToastOnResult } from "@/components/ui/Toast";

/** A line already on the order, as the form needs it. */
export interface EditableLine {
	id: string;
	label: string;
	qty: number;
}

/** One thing off the menu that can be added: a product, or one flavour of it. */
export interface MenuChoice {
	label: string;
	productId: string;
	variantId: string | null;
	/** What a new line starts at, and the step the quantity box moves in. */
	step: number;
}

/**
 * The Order card's lines, and the form that changes them.
 *
 * Same shape as `OrderDetails`: the card reads as it always did, and opens into
 * a form behind a button. `children` is the read-only lines, rendered on the
 * server and swapped out while the form is open.
 */
export function OrderItemsEditor({
	orderId,
	lines,
	menu,
	editable,
	children,
}: {
	orderId: string;
	lines: EditableLine[];
	menu: MenuChoice[];
	/** False on a cancelled order, where there is nothing left to change. */
	editable: boolean;
	children: React.ReactNode;
}) {
	const [editing, setEditing] = useState(false);

	if (editing) {
		return (
			<ItemsForm
				orderId={orderId}
				lines={lines}
				menu={menu}
				onDone={() => setEditing(false)}
			/>
		);
	}

	return (
		<>
			{children}
			{editable ? (
				<div className="mt-5">
					<Button
						variant="secondary"
						onClick={() => setEditing(true)}>
						Change items
					</Button>
				</div>
			) : null}
		</>
	);
}

type Added = MenuChoice & { key: number; qty: string };

function ItemsForm({
	orderId,
	lines,
	menu,
	onDone,
}: {
	orderId: string;
	lines: EditableLine[];
	menu: MenuChoice[];
	onDone: () => void;
}) {
	const [state, action, pending] = useActionState(saveOrderItems, EMPTY_FORM_STATE);
	const error = errorFrom(state);
	const listId = useId();

	// Quantities as typed, so a box can be emptied on the way to a new number.
	const [qtys, setQtys] = useState<Record<string, string>>(() =>
		Object.fromEntries(lines.map((line) => [line.id, String(line.qty)])),
	);
	const [added, setAdded] = useState<Added[]>([]);
	const [search, setSearch] = useState("");

	useToastOnResult(state, "The order is updated.");

	// Back to reading once a save lands, adjusted during render the way
	// OrderDetails does it.
	const [reported, setReported] = useState(state);
	if (reported !== state) {
		setReported(state);
		if (state.result?.ok) onDone();
	}

	// Picking from the list fills the box with the choice's exact label, which
	// is what adds it. Typing a label out in full does the same.
	function onSearch(value: string) {
		const choice = menu.find((item) => item.label === value);
		if (!choice) {
			setSearch(value);
			return;
		}
		setAdded((current) => [...current, { ...choice, key: Date.now(), qty: String(choice.step) }]);
		setSearch("");
	}

	// Only what changed. Unchanged lines are left out, so the trail records
	// exactly what she did and nothing she merely looked at.
	const items = [
		...lines
			.filter((line) => qtys[line.id] !== String(line.qty))
			.map((line) => ({ id: line.id, qty: Number(qtys[line.id] || 0) })),
		...added.map((item) => ({
			product_id: item.productId,
			variant_id: item.variantId,
			qty: Number(item.qty || 0),
		})),
	];

	return (
		<form
			action={action}
			className="flex flex-col gap-5">
			<input
				type="hidden"
				name="id"
				value={orderId}
			/>
			<input
				type="hidden"
				name="items"
				value={JSON.stringify(items)}
			/>

			<p className="text-cocoa-soft text-sm">
				Changed and added lines are priced at today&rsquo;s menu; the rest keep the price they were
				ordered at. Nothing here emails the customer, so once it is right, send the latest email
				again from the card above.
			</p>

			<HairlineList>
				{lines.map((line) => {
					const removed = qtys[line.id] === "0";
					return (
						<HairlineRow
							key={line.id}
							align="center">
							<span className={removed ? "text-cocoa-soft text-sm line-through" : "text-sm"}>
								{line.label}
							</span>
							<span className="flex shrink-0 items-center gap-3">
								<QtyBox
									label={`How many ${line.label}`}
									value={qtys[line.id] ?? ""}
									onChange={(value) => setQtys((current) => ({ ...current, [line.id]: value }))}
								/>
								<RowButton
									onClick={() =>
										setQtys((current) => ({
											...current,
											[line.id]: removed ? String(line.qty) : "0",
										}))
									}>
									{removed ? "Keep" : "Remove"}
								</RowButton>
							</span>
						</HairlineRow>
					);
				})}
				{added.map((item) => (
					<HairlineRow
						key={item.key}
						align="center">
						<span className="text-sm">
							{item.label} <span className="text-cocoa-soft text-xs">(new)</span>
						</span>
						<span className="flex shrink-0 items-center gap-3">
							<QtyBox
								label={`How many ${item.label}`}
								value={item.qty}
								step={item.step}
								onChange={(value) =>
									setAdded((current) =>
										current.map((other) =>
											other.key === item.key ? { ...other, qty: value } : other,
										),
									)
								}
							/>
							<RowButton
								onClick={() =>
									setAdded((current) => current.filter((other) => other.key !== item.key))
								}>
								Remove
							</RowButton>
						</span>
					</HairlineRow>
				))}
			</HairlineList>

			<div>
				<label
					htmlFor={`${listId}-search`}
					className="mb-2 block text-sm font-medium">
					Add something
				</label>
				<Input
					id={`${listId}-search`}
					list={listId}
					value={search}
					onChange={(event) => onSearch(event.target.value)}
					placeholder="Search the menu"
					autoComplete="off"
				/>
				<datalist id={listId}>
					{menu.map((item) => (
						<option
							key={item.label}
							value={item.label}
						/>
					))}
				</datalist>
			</div>

			<div className="flex flex-wrap items-center gap-3">
				<Button
					type="submit"
					disabled={pending || items.length === 0}>
					{pending ? "Saving…" : "Save these items"}
				</Button>
				<RowButton onClick={onDone}>Never mind</RowButton>
			</div>

			{error ? <FormError>{error}</FormError> : null}
		</form>
	);
}

function QtyBox({
	label,
	value,
	step = 1,
	onChange,
}: {
	label: string;
	value: string;
	step?: number;
	onChange: (value: string) => void;
}) {
	// Sized by the wrapper: the control's own `w-full` would win over a width
	// passed in, since `cn` leaves the outcome to stylesheet order.
	return (
		<span className="w-20 shrink-0">
			<Input
				type="number"
				inputMode="numeric"
				min={0}
				step={step}
				aria-label={label}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="text-right"
			/>
		</span>
	);
}

function RowButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="text-cocoa-soft hover:text-cocoa text-sm underline underline-offset-4">
			{children}
		</button>
	);
}
