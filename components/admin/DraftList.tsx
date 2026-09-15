"use client";

import { moveItem, patchItem } from "@/lib/list-edit";
import { ReorderButtons } from "./AdminShell";

/**
 * A hand-ordered list of short entries, edited in place and submitted as one
 * JSON field.
 *
 * The home page's questions and its reviews are the same editor twice: a
 * bordered row, a field or two along the top with the arrows and a Remove
 * beside them, a paragraph underneath, and an "Add another" that stops at
 * twenty. They sit next to each other in the same form, so the two behaving
 * differently is something the owner would see rather than something only a
 * reader of the code would notice.
 *
 * The order of the list is the order on the page. There is no sort number to
 * keep in step and no saved row to match on, because a save replaces the list
 * outright — which is also why `key` is the draft's own, not the database's.
 *
 * A product's variants deliberately are not this. They carry a photo, a price,
 * their own sold-out switch and a fold of allergen checkboxes, and bending this
 * far enough to hold them would leave a component that is mostly holes.
 */
export function DraftList<T extends { key: string }>({
	rows,
	setRows,
	legend,
	noun,
	blank,
	error,
	max = 20,
	fields,
	body,
	labelOf,
}: {
	rows: T[];
	setRows: (next: T[]) => void;
	/** Names the group for a screen reader; the heading above is visual. */
	legend: string;
	/** "question", "review" — used in the add button and the arrows' labels. */
	noun: string;
	/** A fresh empty row. Called, not shared, so each gets its own key. */
	blank: () => T;
	error?: string;
	max?: number;
	/** The top line of the row: one or more short inputs. */
	fields: (row: T, index: number, update: (patch: Partial<T>) => void) => React.ReactNode;
	/** The paragraph underneath. */
	body: (row: T, index: number, update: (patch: Partial<T>) => void) => React.ReactNode;
	/** What to call this row when there is nothing typed in it yet. */
	labelOf: (row: T, index: number) => string;
}) {
	return (
		<fieldset className="flex flex-col gap-3">
			<legend className="sr-only">{legend}</legend>

			{rows.map((row, index) => {
				const update = (patch: Partial<T>) => setRows(patchItem(rows, index, patch));

				return (
					<div
						key={row.key}
						className="border-line flex flex-col gap-3 rounded-md border p-3">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
							{fields(row, index, update)}

							<div className="flex items-center justify-end gap-3">
								<ReorderButtons
									label={labelOf(row, index)}
									layout="row"
									isFirst={index === 0}
									isLast={index === rows.length - 1}
									onMove={(direction) =>
										setRows(moveItem(rows, index, direction === "up" ? -1 : 1))
									}
								/>

								<button
									type="button"
									onClick={() => setRows(rows.filter((_, i) => i !== index))}
									className="border-line hover:border-danger hover:text-danger min-h-11 rounded-md border px-3 text-sm">
									Remove
								</button>
							</div>
						</div>

						{body(row, index, update)}
					</div>
				);
			})}

			{error ? <p className="text-danger text-xs font-medium">{error}</p> : null}

			{rows.length < max ? (
				<button
					type="button"
					onClick={() => setRows([...rows, blank()])}
					className="border-line hover:border-cocoa rounded-pill w-fit border px-4 py-2 text-sm font-medium">
					Add {rows.length === 0 ? `a ${noun}` : `another ${noun}`}
				</button>
			) : null}
		</fieldset>
	);
}
