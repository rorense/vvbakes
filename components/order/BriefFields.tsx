"use client";

import { useId } from "react";
import { MAX_BRIEF_NOTE } from "@/lib/brief";
import type { Product } from "@/lib/types";
import { Input, Textarea } from "@/components/ui/Form";
import { InspirationPicker, type InspirationPhoto } from "./InspirationPicker";

/** The brief as the product page holds it, photos still as files. */
export interface DraftBrief {
	note: string;
	inspirationUrl: string;
	photos: InspirationPhoto[];
}

export const EMPTY_BRIEF: DraftBrief = { note: "", inspirationUrl: "", photos: [] };

/** True when nothing has been said, so the line carries no brief at all. */
export function isDraftEmpty(brief: DraftBrief): boolean {
	return (
		brief.note.trim() === "" && brief.inspirationUrl.trim() === "" && brief.photos.length === 0
	);
}

/**
 * What a customer wants to say about this particular thing.
 *
 * Lives on the product page rather than at the bottom of the order form,
 * because that is where a customer is actually looking at the cake they are
 * describing. A basket with two custom cakes in it for two parties is two
 * briefs, and the old arrangement had nowhere to put the second one.
 *
 * The note is offered on everything. "No sprinkles" and "Happy Birthday Sam on
 * top" are things people want to say about a box of cupcakes as much as about a
 * custom cake, and a textarea is cheap.
 *
 * The photos and the link are only asked for where the owner has ticked "ask
 * for photos and a link" on the product, because an uploader on a cookie page
 * is a question nobody has. Nothing is uploaded here either way — see
 * InspirationPicker for why the files stay in the browser until the order is
 * submitted.
 */
export function BriefFields({
	product,
	value,
	onChange,
}: {
	product: Product;
	value: DraftBrief;
	onChange: (brief: DraftBrief) => void;
}) {
	const noteId = useId();
	const urlId = useId();

	const patch = (fields: Partial<DraftBrief>) => onChange({ ...value, ...fields });

	return (
		<div className="border-line flex flex-col gap-5 border-t pt-5">
			<div className="flex flex-col gap-2">
				<label
					htmlFor={noteId}
					className="text-sm font-medium">
					{product.wantsBrief ? "Tell me about it" : "Anything to add?"}
					<span className="text-cocoa-soft text-xs font-normal">
						{product.wantsBrief ? "" : " (optional)"}
					</span>
				</label>
				<p className="text-cocoa-soft text-xs">
					{product.wantsBrief
						? "The occasion, roughly how many people, flavours, colours, what it says on top. The more you tell me, the better I can price it."
						: "Writing on top, a colour, something to leave out. Anything I should know about this one."}
				</p>
				<Textarea
					id={noteId}
					rows={product.wantsBrief ? 5 : 2}
					maxLength={MAX_BRIEF_NOTE}
					value={value.note}
					onChange={(event) => patch({ note: event.target.value })}
					placeholder={
						product.wantsBrief
							? "e.g. 30th birthday, about 12 people, chocolate, nothing too sweet. Happy Birthday Sam on top."
							: "e.g. no sprinkles on the pink ones"
					}
				/>
			</div>

			{product.wantsBrief ? (
				<>
					{/* A picture is usually the whole brief. Most people have one saved
					    already, and the ones who don't have a link to it. */}
					<InspirationPicker
						photos={value.photos}
						onChange={(photos) => patch({ photos })}
					/>

					<div className="flex flex-col gap-2">
						<label
							htmlFor={urlId}
							className="text-sm font-medium">
							Or a link to one
							<span className="text-cocoa-soft text-xs font-normal"> (optional)</span>
						</label>
						<p className="text-cocoa-soft text-xs">
							Pinterest, Instagram, anywhere. One link is plenty.
						</p>
						<Input
							id={urlId}
							type="url"
							inputMode="url"
							autoComplete="off"
							placeholder="https://www.instagram.com/p/…"
							value={value.inspirationUrl}
							onChange={(event) => patch({ inspirationUrl: event.target.value })}
						/>
					</div>
				</>
			) : null}
		</div>
	);
}
