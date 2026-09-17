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
 * What the note box says on a product that has not been given words of its own.
 *
 * Two pairs, because one box asks two fairly different questions. On something
 * made to a brief it *is* the brief and wants a paragraph; on everything else it
 * is the afterthought at the bottom and wants a line. Either pair is overridden
 * per product by `noteHint` and `notePlaceholder`, which is how the tiramisu
 * gets to ask about ganache without a cookie being asked the same thing.
 *
 * Kept here rather than in the database because it is the answer for almost
 * every product, and thirty copies of it in a table is thirty things to reword
 * the next time it changes.
 */
const NOTE_COPY = {
	brief: {
		hint: "The occasion, any specific flavour, colour, design requests. The more details you provide, the better I can prepare, price and bring your vision to life. Please note that I don’t do writing on cakes - please request a personalised cake topper if you want something specific to be written (3 weeks notice required). Thanks!",
		placeholder:
			"e.g. The cake is for my mum’s 50th birthday, the party theme is pink and white so we’d like the frosting colour of the cake to match. The cake needs to feed 20 people. I’d also like to request a custom cake topper to say: “Happy 50th Mum” in pink. Inspiration picture has been attached, something similar would be good but doesn’t need to match 100%. No dietary requirements.",
	},
	plain: {
		hint: "Anything I should know about this one.",
		placeholder: "e.g. no sprinkles on the pink ones",
	},
} as const;

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
 *   wantsNote         a note. "No sprinkles", "Happy Birthday Sam on top" —
 *                     things people want to say about a box of cupcakes as much
 *                     as about a custom cake, and a textarea is cheap. On by
 *                     default, and off for the things that come how they come:
 *                     asking a chiffon cake for writing on top only invites a
 *                     request she then has to turn down.
 *   wantsCustomFlavour  a flavour of their own, and what the frosting should be.
 *                     The variants answer "which of the ones I make"; this is
 *                     for "could you do pandan", which they otherwise send as a
 *                     DM and she copies into a notebook.
 *   wantsBrief        photos and a link, because an uploader on a cookie page is
 *                     a question nobody has.
 *
 * With all three off there is nothing to ask and nothing is rendered, rule and
 * all: a horizontal line under the price with empty space beneath it is worse
 * than no line.
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

	// The brief and the note are one box. A product made to a brief has nowhere
	// else to say what it should be, so `wantsBrief` outranks the switch rather
	// than being read beside it: turning the note off there would be turning the
	// brief off, which is not what the switch offers to do.
	const asksNote = product.wantsNote || product.wantsBrief;
	const copy = product.wantsBrief ? NOTE_COPY.brief : NOTE_COPY.plain;
	const noteHint = product.noteHint ?? copy.hint;
	const notePlaceholder = product.notePlaceholder ?? copy.placeholder;

	// Nothing is being asked, so there is nothing to draw a line above.
	if (!asksNote && !product.wantsCustomFlavour) return null;

	return (
		<div className="border-line flex flex-col gap-5 border-t pt-5">
			{product.wantsCustomFlavour ? (
				<fieldset className="flex flex-col gap-4">
					<legend className="text-sm font-medium">
						Custom cake flavour
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
							placeholder="e.g. salted caramel, biscoff"
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

					{/* The three things she otherwise explains in DMs: a flavour brings its
					    colour with it, a colour asked for on its own comes out vanilla, and
					    NZ butter is yellow. All true whichever way the box above is set, so
					    the note sits under the box rather than inside either branch. */}
					<p className="text-cocoa-soft text-xs">
						Please note that flavours will colour the frosting e.g. matcha flavoured frosting will
						be green. If coloured frosting for decorating the cake is required, then the flavour
						needs to match the colour, or it will be vanilla flavoured. Due to the yellow colour of
						NZ butter, it is difficult to achieve a white frosting naturally so please bear in mind
						plain frosting will have a yellow tinge.
					</p>

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
								placeholder="e.g. vanilla buttercream coloured pastel pink"
							/>
						</div>
					)}
				</fieldset>
			) : null}

			{asksNote ? (
				<div className="flex flex-col gap-2">
					<label
						htmlFor={noteId}
						className="text-sm font-medium">
						{product.wantsBrief ? "Tell me about it" : "Anything to add?"}
						<span className="text-cocoa-soft text-xs font-normal">
							{product.wantsBrief ? "" : " (optional)"}
						</span>
					</label>
					<p className="text-cocoa-soft text-xs">{noteHint}</p>
					<Textarea
						id={noteId}
						rows={product.wantsBrief ? 7 : 2}
						maxLength={MAX_BRIEF_NOTE}
						value={value.note}
						onChange={(event) => patch({ note: event.target.value })}
						placeholder={notePlaceholder}
					/>
				</div>
			) : null}

			{product.wantsBrief ? (
				<>
					{/* A picture is usually the whole brief. Most people have one saved
					    already, and the ones who don't have a link to it. */}
					<InspirationPicker
						photos={value.photos}
						onChange={(photos) => patch({ photos })}
						hint={product.inspirationHint}
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
