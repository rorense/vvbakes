"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { placeOrder } from "@/app/(site)/order/actions";
import { EMPTY_FORM_STATE, errorFrom, fieldErrorsFrom } from "@/lib/action-state";
import { briefPhotoIds, frostingLabel, hasCustomFlavour } from "@/lib/brief";
import { cartLineKey, clearCart, lineExtras, useCart } from "@/lib/cart";
import { cn } from "@/lib/cn";
import { MAX_ORDER_INSPIRATION_PHOTOS } from "@/lib/constants";
import { formatDateShort, type IsoDate } from "@/lib/dates";
import { loadPhotos, sweepPhotos } from "@/lib/photo-store";
import {
	extraLabel,
	extrasTotalCents,
	findExtras,
	findVariant,
	formatMoney,
	hasVariants,
	isValidQty,
	isVariantAvailable,
	minOrderQty,
	normaliseExtras,
	priceProduct,
} from "@/lib/pricing";
import type {
	CartBrief,
	PickableDate,
	Product,
	PublicCalendarMonth,
	SiteSettings,
} from "@/lib/types";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, FormError, Input, Textarea } from "@/components/ui/Form";
import { Notice } from "@/components/ui/Notice";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { Stepper } from "@/components/ui/Stepper";
import { ProductImage } from "@/components/site/ProductCard";
import { PickupCalendar } from "./PickupCalendar";

/**
 * The order page: a cart, and the few things that have to be asked once.
 *
 * It used to be two pages in one. A custom cake had no product to browse to, so
 * the bottom of this form carried a second personality — a description, an
 * uploader and a link that belonged to the whole order — and the basket above
 * it had to keep pretending it might be empty on purpose. The custom cake is a
 * product now, briefs belong to the lines that carry them, and what is left
 * here is a cart: what you are buying, when you want it, where it goes and who
 * you are.
 *
 * The cart lives in localStorage and is turned into a hidden JSON field on
 * submit; the photos attached to a line live in IndexedDB and are appended to
 * the submission itself. Prices shown here are computed by lib/pricing.ts; the
 * database prices the order again when it is written, and that is what gets
 * charged.
 */
export function OrderForm({
	products,
	dates,
	months,
	settings,
	initialDate = null,
}: {
	products: Product[];
	dates: PickableDate[];
	/** The same month grids the home page draws, for choosing a date. */
	months: PublicCalendarMonth[];
	settings: SiteSettings;
	/** Preselected from ?date=, when someone arrived via the public calendar. */
	initialDate?: string | null;
}) {
	const router = useRouter();
	const { cart, ready, setQty, remove } = useCart();
	const [state, formAction, pending] = useActionState(placeOrder, EMPTY_FORM_STATE);

	// The chosen date is stored, but the value actually used is always checked
	// against the dates on offer, derived rather than synced, so it can never
	// point at a date that has gone.
	const [chosenDateValue, setChosenDateValue] = useState<IsoDate | "">(initialDate ?? "");
	const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup");

	// When the form was opened, used to reject submissions no human could have
	// completed that fast. Held in a ref written from an effect: the clock is an
	// external system, so reading it during render is not allowed, and a hidden
	// input is no good either. React re-applies its value on every re-render,
	// which happens on every quantity change.
	const openedAt = useRef(0);
	const errorRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		openedAt.current = Date.now();
	}, []);

	const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

	// Cart lines resolved against the live catalogue. A product that has since
	// been deleted or sold out drops out here rather than failing on submit, and
	// so does a flavour that has: the basket outlives the menu it was filled
	// from, and the two have to be reconciled somewhere.
	//
	// An extra that has gone is the one thing that does *not* take its line with
	// it. Someone who wanted candles on a cake still wants the cake, so the extra
	// is dropped, counted, and said out loud below. A brief is never dropped: it
	// is the customer's own words, and there is nothing in it to go stale.
	const resolved = useMemo(
		() =>
			cart.lines
				.map((line) => {
					const product = byId.get(line.productId);
					if (!product || !product.isAvailable) return null;
					if (!isValidQty(product, line.qty)) return null;

					const variant = findVariant(product, line.variantId);
					// A flavoured product needs one that still exists and is still on
					// sale, answers included: a combination whose flavour has since
					// sold out is gone even though its own switch is still on. A plain
					// product is checked against the id the cart actually holds, not
					// against `variant`, which is null either way: a saved line naming
					// a flavour the owner has since removed altogether would otherwise
					// sail through here and be refused on submit.
					if (
						hasVariants(product)
							? !variant || !isVariantAvailable(product, variant)
							: Boolean(line.variantId)
					) {
						return null;
					}

					// Resolved against this product's own list, not a shop-wide one: an
					// id that belongs to another product names nothing here, which is
					// the same answer `place_order` gives it.
					//
					// `findExtras` hands them back in the owner's order rather than in
					// whatever order the cart's ids sort into. That is the order the
					// product page offered them in and the order the confirmation email
					// and the order page list them in, so the basket now agrees with
					// all three instead of being the one place they came out shuffled.
					const wanted = normaliseExtras(lineExtras(line));
					const chosen = findExtras(product.extras, wanted).filter(
						({ extra }) => extra.isAvailable,
					);

					return {
						// What the cart itself holds, stale ids and all. Removing or
						// re-counting a line has to match on this, not on what survived.
						source: {
							variantId: line.variantId ?? null,
							extras: lineExtras(line),
							brief: line.brief,
						},
						product,
						variant,
						extras: chosen,
						lostExtras: wanted.length - chosen.length,
						brief: line.brief,
						qty: line.qty,
					};
				})
				.filter((line): line is NonNullable<typeof line> => line !== null),
		[cart.lines, byId],
	);

	// Two saved lines can land on the same thing once a dropped extra is taken
	// off one of them — a cake with candles the owner has since deleted is now
	// just a cake, and the basket may already hold one of those.
	//
	// They are merged rather than listed twice, because `place_order` groups the
	// items it is handed the same way and prices the total quantity as one line.
	// Left unmerged, a bundle price would apply there and not here, and the
	// number on this page would be the one number it must never be: different
	// from the one charged.
	//
	// The brief is part of the key, so two cakes described differently never
	// merge however alike the rest of the line looks. `place_order` groups by it
	// too, which is what keeps the two counts the same.
	const lines = useMemo(() => {
		type Line = (typeof resolved)[number] & {
			key: string;
			sources: Array<(typeof resolved)[number]["source"]>;
		};
		const merged = new Map<string, Line>();

		for (const entry of resolved) {
			const key = cartLineKey(
				entry.product.id,
				entry.variant?.id,
				entry.extras.map(({ extra, qty }) => ({ id: extra.id, qty })),
				entry.brief,
			);
			const found = merged.get(key);

			if (found) {
				found.qty += entry.qty;
				found.lostExtras += entry.lostExtras;
				found.sources.push(entry.source);
			} else {
				merged.set(key, { ...entry, key, sources: [entry.source] });
			}
		}

		return [...merged.values()].map((line) => {
			const menu = priceProduct(line.product, line.qty, line.variant);
			const extrasCents = extrasTotalCents(line.extras, line.qty);

			return {
				...line,
				// `note` explains the menu price and only the menu price, exactly as
				// `pricing_note` does on the order it becomes. The extras are named
				// under the line with their own totals.
				note: menu.note,
				// True for a cake nobody has priced yet. Its `totalCents` is zero and
				// must not be rendered as money.
				onRequest: menu.onRequest,
				extrasCents,
				totalCents: menu.totalCents + extrasCents,
			};
		});
	}, [resolved]);

	/** Every photo the basket still names, in the order the lines are listed. */
	const photoIds = useMemo(() => lines.flatMap((line) => briefPhotoIds(line.brief)), [lines]);

	const photos = useLinePhotos(photoIds);

	// Anything the store is still holding that no line names any more. This is
	// the only moment the whole cart is in hand, so it is the only place in a
	// position to notice.
	useEffect(() => {
		if (!ready) return;
		void sweepPhotos(cart.lines.flatMap((line) => briefPhotoIds(line.brief)));
	}, [ready, cart.lines]);

	// Stamps the timestamp on the way out, and attaches each line's photos under
	// that line's own index. Reading a ref in an event handler is exactly where
	// refs are meant to be read.
	const action = (formData: FormData) => {
		formData.set("startedAt", String(openedAt.current));

		lines.forEach((line, index) => {
			for (const id of briefPhotoIds(line.brief)) {
				const photo = photos.get(id);
				// A photo the store no longer has is left out rather than faked. The
				// words are already on their way; the gap is said out loud below.
				if (photo) formData.append(`linePhotos:${index}`, photo.file, photo.file.name);
			}
		});

		return formAction(formData);
	};

	/** Empties every saved line that fed this one, merged or not. */
	const removeLine = (line: (typeof lines)[number]) => {
		for (const source of line.sources) {
			remove(line.product.id, source.variantId, source.extras, source.brief);
		}
	};

	/** Puts the whole new quantity on the first saved line and drops the rest. */
	const setLineQty = (line: (typeof lines)[number], next: number) => {
		const [first, ...rest] = line.sources;
		if (!first) return;
		setQty(line.product.id, next, first.variantId, first.extras, first.brief);
		for (const source of rest) {
			remove(line.product.id, source.variantId, source.extras, source.brief);
		}
	};

	// A minimum is a rule about the whole product, not about one line: six
	// cupcakes is met by three chocolate and three vanilla. So the lines are
	// counted back together here, the way `place_order` counts them, rather than
	// being checked one at a time — which would drop half a legitimate basket.
	const shortfalls = useMemo(() => {
		const totals = new Map<string, number>();
		for (const line of lines) {
			totals.set(line.product.id, (totals.get(line.product.id) ?? 0) + line.qty);
		}

		return [...totals.entries()]
			.map(([productId, qty]) => {
				const product = byId.get(productId)!;
				return { product, qty, minimum: minOrderQty(product) };
			})
			.filter((entry) => entry.qty < entry.minimum);
	}, [lines, byId]);

	const droppedCount = ready ? cart.lines.length - resolved.length : 0;
	// Counted separately from the dropped lines: an extra going is a smaller thing
	// than a cake going, and rolling the two together would tell someone their
	// cake had been removed when it is sitting right there.
	const droppedExtras = ready ? lines.reduce((total, line) => total + line.lostExtras, 0) : 0;
	// Photos a line still names that the browser no longer has: cleared site
	// data, a different device, a private window that forgot. Worth saying,
	// because the customer chose them and would otherwise never learn.
	const lostPhotos = ready ? photoIds.filter((id) => !photos.has(id)).length : 0;

	const subtotal = lines.reduce((total, line) => total + line.totalCents, 0);
	const deliveryFee = fulfilment === "delivery" ? settings.deliveryFeeCents : 0;
	const total = subtotal + deliveryFee;
	// Something in the basket has no price yet, so the figure above is a subtotal
	// of everything else and has to say so wherever it appears.
	const hasUnpriced = lines.some((line) => line.onRequest);
	// And something in it was asked for in a flavour of its own, which is a real
	// price the owner may add to rather than half of one. A different sentence,
	// said in the same place. Repeated on the order page once it is placed, where
	// it stops the moment she decides what it costs.
	const mayCostMore = lines.some((line) => line.brief && hasCustomFlavour(line.brief));

	const attachedPhotos = photoIds.filter((id) => photos.has(id)).length;
	const tooManyPhotos = attachedPhotos > MAX_ORDER_INSPIRATION_PHOTOS;

	const isEmpty = ready && lines.length === 0;

	const chosenDate = dates.find((date) => date.date === chosenDateValue) ?? dates[0] ?? null;
	const pickupDate = chosenDate?.date ?? "";

	// The window is the owner's own prose, typed in the admin, so it is repeated
	// under the field rather than turned into a list of hours nobody promised.
	// Without it someone asks for nine in the morning on a day she opens at four,
	// and the first thing she has to write back is the thing the page knew.
	const pickupWindow = settings.pickupWindowText?.replace(/[.\s]+$/, "");
	const timeHint =
		fulfilment === "delivery"
			? "Roughly when suits you. I'll confirm a time when I reply."
			: `Roughly when you'd like to collect.${pickupWindow ? ` ${pickupWindow}.` : ""} I'll confirm a time when I reply.`;

	// On success, empty the cart and hand over to the thank-you page, which is
	// the status page's front door: it says the request landed, then sends
	// people on to the status link they'll come back to later.
	useEffect(() => {
		if (state.result?.ok) {
			clearCart();
			router.push(`/order/${state.result.data.token}/thanks`);
		}
	}, [state.result, router]);

	const error = errorFrom(state);
	const fieldErrors = fieldErrorsFrom(state);

	// Move focus to the error so it is announced and not scrolled past.
	useEffect(() => {
		if (error) {
			errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
			errorRef.current?.focus();
		}
	}, [error]);

	// Held back rather than sent and refused. The database would raise
	// QTY_BELOW_MINIMUM and the customer would get the same answer a scroll
	// later, having filled in the rest of the form for nothing.
	const canSubmit =
		lines.length > 0 && Boolean(pickupDate) && shortfalls.length === 0 && !tooManyPhotos;

	// An empty basket is now simply an empty basket. There is nothing to ask
	// for here that the shop does not ask better, so this is a signpost rather
	// than a form.
	if (isEmpty) {
		return (
			<div className="border-line bg-paper-deep flex flex-col items-start gap-4 rounded-md border p-8">
				<h2 className="font-display text-2xl">Nothing in your order yet</h2>
				{droppedCount > 0 ? (
					<p className="text-cocoa-soft text-sm">
						What you had saved is no longer available. Have another look and I&rsquo;ll see what I
						can do.
					</p>
				) : (
					<div className="text-cocoa-soft flex flex-col gap-3 text-sm">
						<p>
							Your order is waiting for something sweet! Have a browse through the shop and add what
							you&rsquo;re wanting :)
						</p>
						<p>
							Planning a custom cake? You can start there too, just tell me what you have in mind.
						</p>
					</div>
				)}
				<ButtonLink href="/shop">Have a look at the menu</ButtonLink>
			</div>
		);
	}

	return (
		<form
			action={action}
			className="flex flex-col gap-12 pb-28 sm:pb-0">
			{/* Hidden state. The cart is a client-side thing; this is how it reaches
			    the server without a round trip per change.

			    The order of this array is the order the photos above were appended
			    under, so a line's index means the same thing on both sides. */}
			<input
				type="hidden"
				name="items"
				value={JSON.stringify(
					lines.map((line) => ({
						productId: line.product.id,
						variantId: line.variant?.id ?? null,
						// Only what survived, at the counts this page has been showing.
						// Sending an id the owner has deleted — or more of one than she
						// now allows — would have the database refuse the whole order
						// over a packet of candles this page has already dealt with.
						extras: line.extras.map(({ extra, qty }) => ({ id: extra.id, qty })),
						note: line.brief?.note ?? "",
						inspirationUrl: line.brief?.inspirationUrl ?? "",
						customFlavour: line.brief?.customFlavour ?? "",
						// Already reconciled by `normaliseBrief` on the way into the
						// cart: a brief carrying the tick carries no frosting text.
						// `place_order` reconciles them again anyway, because it does
						// not get to assume this page wrote the basket.
						frosting: line.brief?.frosting ?? "",
						frostingMatchesFlavour: line.brief?.frostingMatchesFlavour ?? false,
						qty: line.qty,
					})),
				)}
			/>
			<input
				type="hidden"
				name="pickupDate"
				value={pickupDate}
			/>
			<input
				type="hidden"
				name="fulfilment"
				value={fulfilment}
			/>

			{/* Honeypot. Off-screen rather than display:none, which some bots skip. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden">
				<label htmlFor="website">Leave this empty</label>
				<input
					id="website"
					name="website"
					type="text"
					tabIndex={-1}
					autoComplete="off"
					defaultValue=""
				/>
			</div>

			<Step
				n="01"
				title="What you'd like">
				{droppedCount > 0 ? (
					<Notice className="mb-4">
						{droppedCount === 1 ? "An item" : `${droppedCount} items`} in your order
						{droppedCount === 1 ? " is" : " are"} no longer available and{" "}
						{droppedCount === 1 ? "has" : "have"} been removed.
					</Notice>
				) : null}

				{droppedExtras > 0 ? (
					<Notice className="mb-4">
						{droppedExtras === 1 ? "An extra" : `${droppedExtras} extras`} you added{" "}
						{droppedExtras === 1 ? "is" : "are"} no longer available, so{" "}
						{droppedExtras === 1 ? "it has" : "they have"} been taken off. Everything else is still
						here.
					</Notice>
				) : null}

				{lostPhotos > 0 ? (
					<Notice className="mb-4">
						{lostPhotos === 1 ? "A photo" : `${lostPhotos} photos`} you added{" "}
						{lostPhotos === 1 ? "isn't" : "aren't"} on this device any more — photos stay in the
						browser they were chosen in until the order is sent. Everything you typed is still here,
						and you can add {lostPhotos === 1 ? "it" : "them"} again from the product page.
					</Notice>
				) : null}

				<HairlineList>
					{lines.map((line) => (
						<HairlineRow
							key={line.key}
							align="center"
							className="flex-col gap-3 sm:flex-row sm:gap-4">
							<div className="flex w-full min-w-0 flex-1 items-start gap-4">
								<div className="bg-paper-deep relative size-16 shrink-0 overflow-hidden rounded-md">
									<ProductImage
										product={line.product}
										variant={line.variant}
										sizes="64px"
									/>
								</div>
								<div className="flex min-w-0 flex-col gap-0.5">
									<Link
										href={`/shop/${line.product.slug}`}
										className="font-medium hover:underline">
										{line.product.name}
									</Link>
									{line.variant ? (
										<p className="text-cocoa-soft text-xs">{line.variant.name}</p>
									) : null}
									<p className="text-cocoa-soft text-xs">{line.note}</p>
									{/* Named with their own totals rather than folded into the
									    line's, so the price beside the line goes on meaning what
									    the menu charged. */}
									{line.extras.map(({ extra, qty }) => (
										<p
											key={extra.id}
											className="text-cocoa-soft text-xs">
											+ {extraLabel(extra.name, qty)}{" "}
											{extra.priceCents === 0
												? "(free)"
												: formatMoney(extra.priceCents * qty * line.qty)}
										</p>
									))}

									<LineBrief
										brief={line.brief}
										photos={photos}
										href={`/shop/${line.product.slug}`}
									/>

									<button
										type="button"
										onClick={() => removeLine(line)}
										className="text-cocoa-soft hover:text-cocoa mt-1 w-fit text-xs underline underline-offset-2">
										Remove
									</button>
								</div>
							</div>

							{/* On a phone this drops to its own row, where the stepper and
							    the line total get the width they need. */}
							<div className="flex w-full shrink-0 items-center justify-between gap-3 pl-20 sm:w-auto sm:justify-end sm:gap-5 sm:pl-0">
								<Stepper
									size="sm"
									value={line.qty}
									min={line.product.qtyStep}
									max={null}
									step={line.product.qtyStep}
									label={
										line.variant ? `${line.product.name}, ${line.variant.name}` : line.product.name
									}
									// The stepper never goes below its own min, so this cannot
									// reach zero. Emptying a line is what "Remove" is for.
									onChange={(next) => setLineQty(line, next)}
								/>
								{/* An unpriced cake shows what its extras come to, or nothing
								    at all. "$0.00" beside a custom cake reads as a free one. */}
								<p
									className={
										line.onRequest
											? "text-cocoa-soft w-16 text-right text-xs"
											: "font-display w-16 text-right text-lg"
									}>
									{line.onRequest
										? line.extrasCents > 0
											? formatMoney(line.extrasCents)
											: "—"
										: formatMoney(line.totalCents)}
								</p>
							</div>
						</HairlineRow>
					))}
				</HairlineList>

				{shortfalls.length > 0 ? (
					<Notice
						tone="warning"
						role="status"
						className="mt-4">
						{shortfalls
							.map(
								(short) =>
									`${short.product.name} is ordered ${short.minimum} at a time, and you have ${short.qty}.`,
							)
							.join(" ")}
					</Notice>
				) : null}

				{tooManyPhotos ? (
					<Notice
						tone="warning"
						role="status"
						className="mt-4">
						That&rsquo;s {attachedPhotos} photos across your order, and{" "}
						{MAX_ORDER_INSPIRATION_PHOTOS} is the most I can take at once. Take a few off on the
						product page, or send the rest through once I reply.
					</Notice>
				) : null}

				<Link
					href="/shop"
					className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
					Add something else
				</Link>
			</Step>

			<Step
				n="02"
				title={fulfilment === "delivery" ? "Delivery date" : "Pickup date"}>
				<PickupCalendar
					months={months}
					dates={dates}
					value={pickupDate}
					onChange={setChosenDateValue}
					leadTimeDays={settings.leadTimeDays}
				/>
				{fieldErrors.pickupDate ? (
					<p className="text-danger mt-3 text-xs font-medium">{fieldErrors.pickupDate}</p>
				) : null}

				{/* Under the calendar, and optional. A day is the thing that has to be
				    booked; the hour is a preference, and most people do not have one.
				    It is uncontrolled because nothing on this page reads it — it goes
				    to the server as a plain field and comes back on the order. */}
				<div className="mt-8">
					<Field
						label={
							fulfilment === "delivery" ? "Approximate delivery time" : "Approximate pickup time"
						}
						hint={timeHint}
						className="sm:max-w-xs">
						{(props) => (
							<Input
								{...props}
								name="pickupTime"
								type="time"
							/>
						)}
					</Field>
				</div>
			</Step>

			{settings.deliveryEnabled ? (
				<Step
					n="03"
					title="Pickup or delivery">
					<div className="grid gap-3 sm:grid-cols-2">
						<FulfilmentOption
							checked={fulfilment === "pickup"}
							onChange={() => setFulfilment("pickup")}
							title="Pick up"
							detail={
								settings.pickupSuburb
									? `From ${settings.pickupSuburb}${settings.pickupWindowText ? `, ${settings.pickupWindowText.toLowerCase()}` : ""}`
									: "Collect from us"
							}
							price="Free"
						/>
						<FulfilmentOption
							checked={fulfilment === "delivery"}
							onChange={() => setFulfilment("delivery")}
							title="Delivery"
							detail={settings.deliveryAreaText ?? "To your door"}
							price={
								settings.deliveryFeeCents > 0 ? formatMoney(settings.deliveryFeeCents) : "Free"
							}
						/>
					</div>

					{fulfilment === "delivery" ? (
						<div className="mt-4">
							<Field
								label="Delivery address"
								required
								error={fieldErrors.deliveryAddress}>
								{(props) => (
									<Textarea
										{...props}
										name="deliveryAddress"
										rows={3}
										autoComplete="street-address"
										placeholder="Street, suburb, city"
										invalid={Boolean(fieldErrors.deliveryAddress)}
									/>
								)}
							</Field>
						</div>
					) : null}
				</Step>
			) : null}

			<Step
				n={settings.deliveryEnabled ? "04" : "03"}
				title="Your details">
				<div className="grid gap-5 sm:grid-cols-2">
					<Field
						label="Name"
						required
						error={fieldErrors.customerName}
						className="sm:col-span-2">
						{(props) => (
							<Input
								{...props}
								name="customerName"
								autoComplete="name"
								invalid={Boolean(fieldErrors.customerName)}
							/>
						)}
					</Field>

					<Field
						label="Email"
						required
						hint="This is where your confirmation goes."
						error={fieldErrors.customerEmail}>
						{(props) => (
							<Input
								{...props}
								name="customerEmail"
								type="email"
								autoComplete="email"
								inputMode="email"
								invalid={Boolean(fieldErrors.customerEmail)}
							/>
						)}
					</Field>

					<Field
						label="Phone"
						required
						error={fieldErrors.customerPhone}>
						{(props) => (
							<Input
								{...props}
								name="customerPhone"
								type="tel"
								autoComplete="tel"
								inputMode="tel"
								invalid={Boolean(fieldErrors.customerPhone)}
							/>
						)}
					</Field>
				</div>
			</Step>

			{/* Kept at the order rather than moved onto the lines with the rest of
			    the brief. "Nobody at the table can have nuts" is a fact about the
			    whole order, and asking for it once is how it stays that way. */}
			<Step
				n={settings.deliveryEnabled ? "05" : "04"}
				title="Anything I should know">
				<Field
					label="Allergies or notes"
					hint="Anything I should avoid, or how you'd like it packed. Allergies especially. Anything about one particular item goes on that item, back in the shop."
					error={fieldErrors.notes}>
					{(props) => (
						<Textarea
							{...props}
							name="notes"
							rows={3}
						/>
					)}
				</Field>
			</Step>

			<div
				ref={errorRef}
				tabIndex={-1}
				className="scroll-mt-24 outline-none">
				{error ? <FormError>{error}</FormError> : null}
			</div>

			{/* The totals and the real button. On a phone the sticky bar below does
			    this job instead. */}
			<div className="flex flex-col gap-4">
				<div className="hidden flex-col gap-4 sm:flex">
					<Total
						subtotal={subtotal}
						deliveryFee={deliveryFee}
						total={total}
						hasUnpriced={hasUnpriced}
						mayCostMore={mayCostMore}
					/>
					<div>
						<Button
							type="submit"
							size="lg"
							disabled={pending || !canSubmit}>
							{pending ? "Sending…" : "Send order request"}
						</Button>
					</div>
				</div>

				{/* Outside the block above so a phone sees it too: terms only hold
				    someone who was shown them before they pressed the button, and
				    the sticky bar has no room to say anything at all. */}
				<p className="text-cocoa-soft text-xs">
					This is a request, not a payment. I&rsquo;ll email you to confirm, with a price and where
					to send it. Sending it means you agree to the{" "}
					<Link
						href="/terms"
						className="underline">
						order terms
					</Link>
					.
				</p>
			</div>

			<div className="border-line bg-paper fixed inset-x-0 bottom-0 z-20 border-t px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
				<div className="mb-2 flex items-baseline justify-between">
					<span className="text-cocoa-soft text-xs">
						{chosenDate ? formatDateShort(chosenDate.date) : "Choose a date"}
					</span>
					<span className="flex items-baseline gap-2">
						{total > 0 ? <span className="font-display text-xl">{formatMoney(total)}</span> : null}
						{/* The desktop summary says all of this in sentences; there is no
						    room for one here, so the bar carries the shortest true
						    version. A cake with no price at all is the bigger caveat of
						    the two, so it wins when an order somehow holds both. */}
						{hasUnpriced ? (
							<span className="text-cocoa-soft text-xs">
								{total > 0 ? "+ your cake" : "Price to follow"}
							</span>
						) : mayCostMore ? (
							<span className="text-cocoa-soft text-xs">may change</span>
						) : null}
					</span>
				</div>
				<Button
					type="submit"
					size="lg"
					className="w-full"
					disabled={pending || !canSubmit}>
					{pending ? "Sending…" : "Send order request"}
				</Button>
			</div>
		</form>
	);
}

/** A photo out of the browser's store, with something to show it with. */
interface LinePhoto {
	file: File;
	/** An object URL, revoked when this component lets the photo go. */
	url: string;
}

/**
 * The photos these ids name, loaded out of the browser's own store.
 *
 * They were chosen on a product page and have been waiting in IndexedDB ever
 * since; this is where they are read back, shown, and — on submit — attached to
 * the order. One object URL is minted per photo and revoked when the set
 * changes, so a basket edited a dozen times does not leak a dozen blobs.
 *
 * An id that no longer names anything simply does not appear in the map. The
 * form counts the gap and says so rather than pretending.
 */
function useLinePhotos(ids: string[]): Map<string, LinePhoto> {
	const [photos, setPhotos] = useState<Map<string, LinePhoto>>(() => new Map());
	// The ids as one string, so the effect re-runs when the *set* changes rather
	// than on every render that rebuilt the array.
	const key = ids.join(",");

	useEffect(() => {
		let live = true;
		const wanted = key === "" ? [] : key.split(",");
		const minted: string[] = [];

		void loadPhotos(wanted).then((files) => {
			const next = new Map<string, LinePhoto>();
			for (const [id, file] of files) {
				const url = URL.createObjectURL(file);
				minted.push(url);
				next.set(id, { file, url });
			}

			// Unmounted, or the ids moved on, while the store was being read. The
			// URLs just minted have nowhere to go.
			if (!live) {
				for (const url of minted) URL.revokeObjectURL(url);
				return;
			}
			setPhotos(next);
		});

		return () => {
			live = false;
			for (const url of minted) URL.revokeObjectURL(url);
		};
	}, [key]);

	return photos;
}

/**
 * What a customer said about one line, shown back to them.
 *
 * Read-only on purpose. This is a receipt of what they typed on the product
 * page, and the product page is where it is changed — an editor here would be a
 * second place for the same words to live, and the two would disagree the first
 * time somebody used both.
 */
function LineBrief({
	brief,
	photos,
	href,
}: {
	brief: CartBrief | undefined;
	photos: Map<string, LinePhoto>;
	/** The product page, where the brief can actually be rewritten. */
	href: string;
}) {
	if (!brief) return null;

	const shown = (brief.photoIds ?? [])
		.map((id) => photos.get(id))
		.filter((photo): photo is LinePhoto => photo !== undefined);

	const frosting = frostingLabel(brief.frosting, brief.frostingMatchesFlavour);

	return (
		<div className="border-line mt-2 flex flex-col gap-2 border-l pl-3">
			{/* Labelled, unlike the note, because these are answers to questions
			    and the answers are short enough to be mistaken for each other:
			    "pandan" on its own could as easily be the frosting. */}
			{brief.customFlavour ? (
				<p className="text-cocoa-soft text-xs">Flavour: {brief.customFlavour}</p>
			) : null}
			{frosting ? <p className="text-cocoa-soft text-xs">Frosting: {frosting}</p> : null}

			{brief.note ? (
				<p className="text-cocoa-soft text-xs whitespace-pre-wrap">{brief.note}</p>
			) : null}

			{shown.length > 0 ? (
				<ul className="flex flex-wrap gap-2">
					{shown.map((photo, index) => (
						<li key={photo.url}>
							{/* eslint-disable-next-line @next/next/no-img-element -- a blob:
							    URL for a file that has not left the browser; next/image
							    would try to optimise something it cannot fetch. */}
							<img
								src={photo.url}
								alt={`Inspiration photo ${index + 1}`}
								className="border-line size-12 rounded-md border object-cover"
							/>
						</li>
					))}
				</ul>
			) : null}

			{brief.inspirationUrl ? (
				<p className="text-cocoa-soft truncate text-xs">{brief.inspirationUrl}</p>
			) : null}

			<Link
				href={href}
				className="text-cocoa-soft hover:text-cocoa w-fit text-xs underline underline-offset-2">
				Change this
			</Link>
		</div>
	);
}

function Step({
	n,
	title,
	id,
	children,
}: {
	n: string;
	title: string;
	id?: string;
	children: React.ReactNode;
}) {
	return (
		<section
			id={id}
			className="flex scroll-mt-24 flex-col gap-5">
			<div className="flex items-baseline gap-4">
				<span
					className="font-display text-cocoa-soft text-lg"
					aria-hidden="true">
					{n}
				</span>
				<h2 className="text-2xl">{title}</h2>
			</div>
			{children}
		</section>
	);
}

function Total({
	subtotal,
	deliveryFee,
	total,
	hasUnpriced,
	mayCostMore,
}: {
	subtotal: number;
	deliveryFee: number;
	total: number;
	/** True when something in the basket has no price on it yet. */
	hasUnpriced: boolean;
	/**
	 * True when something in the basket was asked for in a flavour of its own.
	 *
	 * A different sentence from `hasUnpriced`, because the figure above is a real
	 * price rather than half of one — it is just a price the owner is allowed to
	 * add to once she has read what is being asked.
	 */
	mayCostMore: boolean;
}) {
	return (
		<div className="flex flex-col gap-2">
			<HairlineList as="dl">
				{deliveryFee > 0 ? (
					<>
						<HairlineRow as="div">
							<dt className="text-cocoa-soft text-sm">Subtotal</dt>
							<dd className="text-sm">{formatMoney(subtotal)}</dd>
						</HairlineRow>
						<HairlineRow as="div">
							<dt className="text-cocoa-soft text-sm">Delivery</dt>
							<dd className="text-sm">{formatMoney(deliveryFee)}</dd>
						</HairlineRow>
					</>
				) : null}
				<HairlineRow as="div">
					<dt className="font-medium">{hasUnpriced && total > 0 ? "So far" : "Total"}</dt>
					<dd className={total === 0 ? "text-cocoa-soft text-sm" : "font-display text-2xl"}>
						{total === 0 ? "I'll send you a price" : formatMoney(total)}
					</dd>
				</HairlineRow>
			</HairlineList>

			{/* Said out loud rather than folded into the number, because a total
			    that is not the whole total is the one number this shop cannot let
			    a customer misread. */}
			{hasUnpriced && total > 0 ? (
				<p className="text-cocoa-soft text-xs">
					Plus whatever the custom work comes to. I&rsquo;ll price it once I&rsquo;ve read your
					brief and email you the full total.
				</p>
			) : null}

			{mayCostMore ? (
				<p className="text-cocoa-soft text-xs">
					You&rsquo;ve asked for a flavour of your own, which can cost a little more than the price
					on the menu. I&rsquo;ll email you if it does, before I make a start.
				</p>
			) : null}
		</div>
	);
}

function FulfilmentOption({
	checked,
	onChange,
	title,
	detail,
	price,
}: {
	checked: boolean;
	onChange: () => void;
	title: string;
	detail: string;
	price: string;
}) {
	return (
		<label
			className={cn(
				"flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors",
				checked ? "border-cocoa bg-paper-deep" : "border-line hover:border-cocoa",
			)}>
			<input
				type="radio"
				name="fulfilmentChoice"
				checked={checked}
				onChange={onChange}
				className="mt-1 size-4 shrink-0 accent-[var(--color-rose-deep)]"
			/>
			<span className="flex flex-1 flex-col gap-0.5">
				<span className="flex items-baseline justify-between gap-3">
					<span className="font-medium">{title}</span>
					<span className="text-cocoa-soft text-sm">{price}</span>
				</span>
				<span className="text-cocoa-soft text-xs">{detail}</span>
			</span>
		</label>
	);
}
