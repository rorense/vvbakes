"use client";

import { useId } from "react";
import { MAX_BRIEF_FLAVOUR, MAX_BRIEF_FROSTING, MAX_BRIEF_NOTE } from "@/lib/brief";
import type { Product } from "@/lib/types";
import { Checkbox, Input, Textarea } from "@/components/ui/Form";
import { InspirationPicker, type InspirationPhoto } from "./InspirationPicker";

/** The brief as the product page holds it, photos still as files. */
export interface DraftBrief {
	note: string;
	inspirationUrl: string;
	photos: InspirationPhoto[];
	customFlavour: string;
	frosting: string;
	frostingMatchesFlavour: boolean;
}

export const EMPTY_BRIEF: DraftBrief = {
	note: "",
	inspirationUrl: "",
	photos: [],
	customFlavour: "",
	frosting: "",
	frostingMatchesFlavour: false,
};

/** True when nothing has been said, so the line carries no brief at all. */
export function isDraftEmpty(brief: DraftBrief): boolean {
	return (
		brief.note.trim() === "" &&
		brief.inspirationUrl.trim() === "" &&
		brief.photos.length === 0 &&
		brief.customFlavour.trim() === "" &&
		brief.frosting.trim() === "" &&
		// A ticked box with nothing typed anywhere is still an instruction: it
		// says the frosting should taste of whichever flavour they picked off the
		// menu. `normaliseBrief` agrees, and both have to, or a line would go into
		// the basket having quietly dropped the only thing asked of it.
		!brief.frostingMatchesFlavour
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
 * Three questions, each behind its own switch on the product:
 *
 *   always            a note. "No sprinkles", "Happy Birthday Sam on top" —
 *                     things people want to say about a box of cupcakes as much
 *                     as about a custom cake, and a textarea is cheap.
 *   wantsCustomFlavour  a flavour of their own, and what the frosting should be.
 *                     The variants answer "which of the ones I make"; this is
 *                     for "could you do pandan", which they otherwise send as a
 *                     DM and she copies into a notebook.
 *   wantsBrief        photos and a link, because an uploader on a cookie page is
 *                     a question nobody has.
 *
 * Nothing is uploaded here whatever the switches say — see InspirationPicker for
 * why the files stay in the browser until the order is submitted.
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
	const flavourId = useId();
	const frostingId = useId();

	const patch = (fields: Partial<DraftBrief>) => onChange({ ...value, ...fields });

	// Anything custom on something that already has a price may come to more
	// than that price, and this is the moment to say so: after they have read
	// what is being asked of them and before they put it in the basket. A
	// price-on-request product says the whole price is still to come, which
	// covers this and more.
	const mayCostMore = !product.priceOnRequest && (product.wantsCustomFlavour || product.wantsBrief);

	return (
		<div className="border-line flex flex-col gap-5 border-t pt-5">
			{product.wantsCustomFlavour ? (
				<fieldset className="flex flex-col gap-4">
					<legend className="text-sm font-medium">
						A flavour of your own
						<span className="text-cocoa-soft text-xs font-normal"> (optional)</span>
					</legend>
					<div className="flex flex-col gap-2">
						<label
							htmlFor={flavourId}
							className="text-cocoa-soft text-xs">
							Not on the list? Tell me what you&rsquo;d like and I&rsquo;ll see what I can do.
						</label>
						<Input
							id={flavourId}
							maxLength={MAX_BRIEF_FLAVOUR}
							autoComplete="off"
							value={value.customFlavour}
							onChange={(event) => patch({ customFlavour: event.target.value })}
							placeholder="e.g. pandan, salted caramel, Biscoff"
						/>
					</div>

					{/* One question with two answers, not two questions. Ticking the box
					    is the whole instruction, so the text field goes rather than
					    sitting there greyed: leaving it visible invites someone to fill
					    in both, and an order that says two things about one frosting is
					    an order she has to ring somebody about. */}
					<Checkbox
						label="Make the frosting match the flavour"
						checked={value.frostingMatchesFlavour}
						onChange={(event) =>
							patch({
								frostingMatchesFlavour: event.target.checked,
								// Cleared on the way in rather than on the way out, so what
								// is on screen is exactly what the basket will carry.
								frosting: event.target.checked ? "" : value.frosting,
							})
						}
					/>

					{value.frostingMatchesFlavour ? null : (
						<div className="flex flex-col gap-2">
							<label
								htmlFor={frostingId}
								className="text-cocoa-soft text-xs">
								Or say what colour or flavour you&rsquo;d like the frosting to be.
							</label>
							<Input
								id={frostingId}
								maxLength={MAX_BRIEF_FROSTING}
								autoComplete="off"
								value={value.frosting}
								onChange={(event) => patch({ frosting: event.target.value })}
								placeholder="e.g. pale pink, vanilla buttercream"
							/>
						</div>
					)}
				</fieldset>
			) : null}

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
						? "The occasion, any specific flavour, colour, design requests. The more details you provide, the better I can prepare, price and bring your vision to life."
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
							? "e.g. Cake is for a 50th birthday party, is it possible to request a custom “happy 50th birthday topper”, make the cake less sweet."
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

			{mayCostMore ? (
				<p className="text-cocoa-soft text-xs">
					A flavour of your own, or a design matched to a photo, can cost a little more than the
					price on the menu. I&rsquo;ll work out what it comes to and let you know before I bake
					anything.
				</p>
			) : null}
		</div>
	);
}
