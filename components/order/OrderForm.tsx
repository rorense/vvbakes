"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { placeOrder } from "@/app/(site)/order/actions";
import { EMPTY_FORM_STATE, errorFrom, fieldErrorsFrom } from "@/lib/action-state";
import { clearCart, useCart } from "@/lib/cart";
import { cn } from "@/lib/cn";
import { formatDateShort, type IsoDate } from "@/lib/dates";
import {
	findVariant,
	formatMoney,
	hasVariants,
	isValidQty,
	minOrderQty,
	minQty,
	priceProduct,
} from "@/lib/pricing";
import type { PickableDate, Product, PublicCalendarMonth, SiteSettings } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, FormError, Input, Textarea } from "@/components/ui/Form";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { Stepper } from "@/components/ui/Stepper";
import { ProductImage } from "@/components/site/ProductCard";
import { InspirationPicker, type InspirationPhoto } from "./InspirationPicker";
import { PickupCalendar } from "./PickupCalendar";

/**
 * The order form, laid out as a printed order slip: numbered sections down one
 * column, a hairline list of what you're buying, and a running total pinned to
 * the bottom of the screen on a phone.
 *
 * The cart lives in localStorage and is turned into a hidden JSON field on
 * submit. Prices shown here are computed by lib/pricing.ts; the database prices
 * the order again when it is written, and that is what gets charged.
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

	// Inspiration photos are held here as compressed files and only leave the
	// browser attached to the submission itself. See InspirationPicker for why.
	const [photos, setPhotos] = useState<InspirationPhoto[]>([]);

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

	// Stamps the timestamp on the way out, and attaches the photos. Reading a ref
	// in an event handler is exactly where refs are meant to be read.
	const action = (formData: FormData) => {
		formData.set("startedAt", String(openedAt.current));
		for (const photo of photos) {
			formData.append("inspirationPhotos", photo.file, photo.file.name);
		}
		return formAction(formData);
	};

	const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

	// Cart lines resolved against the live catalogue. A product that has since
	// been deleted or sold out drops out here rather than failing on submit, and
	// so does a flavour that has: the basket outlives the menu it was filled
	// from, and the two have to be reconciled somewhere.
	const lines = useMemo(
		() =>
			cart.lines
				.map((line) => {
					const product = byId.get(line.productId);
					if (!product || !product.isAvailable) return null;
					if (!isValidQty(product, line.qty)) return null;

					const variant = findVariant(product, line.variantId);
					// A flavoured product needs one that still exists and is still on
					// sale. A plain one is checked against the id the cart actually
					// holds, not against `variant`, which is null either way: a saved
					// line naming a flavour the owner has since removed altogether
					// would otherwise sail through here and be refused on submit.
					if (hasVariants(product) ? !variant?.isAvailable : Boolean(line.variantId)) {
						return null;
					}

					return {
						key: `${product.id}:${variant?.id ?? ""}`,
						product,
						variant,
						qty: line.qty,
						...priceProduct(product, line.qty, variant),
					};
				})
				.filter((line): line is NonNullable<typeof line> => line !== null),
		[cart.lines, byId],
	);

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

	const droppedCount = ready ? cart.lines.length - lines.length : 0;
	const subtotal = lines.reduce((total, line) => total + line.totalCents, 0);
	const deliveryFee = fulfilment === "delivery" ? settings.deliveryFeeCents : 0;
	const total = subtotal + deliveryFee;

	const chosenDate = dates.find((date) => date.date === chosenDateValue) ?? dates[0] ?? null;
	const pickupDate = chosenDate?.date ?? "";

	// On success, empty the cart and hand over to the status page.
	useEffect(() => {
		if (state.result?.ok) {
			clearCart();
			router.push(`/order/${state.result.data.token}`);
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

	// An empty basket used to end the journey here. It now means a custom cake:
	// the thing she mostly makes, and the thing nobody can put in a basket.
	const isCustomOnly = ready && lines.length === 0;

	// Held back rather than sent and refused. The database would raise
	// QTY_BELOW_MINIMUM and the customer would get the same answer a scroll
	// later, having filled in the rest of the form for nothing.
	const canSubmit = Boolean(pickupDate) && shortfalls.length === 0;

	return (
		<form
			action={action}
			className="flex flex-col gap-12 pb-28 sm:pb-0">
			{/* Hidden state. The cart is a client-side thing; this is how it reaches
			    the server without a round trip per change. */}
			<input
				type="hidden"
				name="items"
				value={JSON.stringify(
					lines.map((line) => ({
						productId: line.product.id,
						variantId: line.variant?.id ?? null,
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
				title={isCustomOnly ? "Your cake" : "What you'd like"}>
				{droppedCount > 0 ? (
					<p className="border-line bg-paper-deep mb-4 rounded-md border px-4 py-3 text-sm">
						{droppedCount === 1 ? "An item" : `${droppedCount} items`} in your order
						{droppedCount === 1 ? " is" : " are"} no longer available and{" "}
						{droppedCount === 1 ? "has" : "have"} been removed.
					</p>
				) : null}

				{isCustomOnly ? (
					<div className="border-line bg-paper-deep flex flex-col items-start gap-3 rounded-md border p-5">
						<p className="text-sm font-medium">Nothing off the menu, just a cake</p>
						<p className="text-cocoa-soft text-sm">
							{droppedCount > 0
								? "What you had saved is no longer available. Tell me what you're after below and I'll see what I can do."
								: "Tell me about it below and I'll come back with a price. You can add things from the menu too if you'd like."}
						</p>
						<Link
							href="/shop"
							className="text-sm font-medium underline underline-offset-4">
							Have a look at the menu
						</Link>
					</div>
				) : null}

				<HairlineList className={isCustomOnly ? "hidden" : undefined}>
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
									<button
										type="button"
										onClick={() => remove(line.product.id, line.variant?.id ?? null)}
										className="text-cocoa-soft hover:text-cocoa w-fit text-xs underline underline-offset-2">
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
									min={minQty(line.product)}
									max={null}
									step={line.product.qtyStep}
									label={
										line.variant ? `${line.product.name}, ${line.variant.name}` : line.product.name
									}
									onChange={(next) =>
										setQty(
											line.product.id,
											next < minQty(line.product) ? 0 : next,
											line.variant?.id ?? null,
										)
									}
								/>
								<p className="font-display w-16 text-right text-lg">
									{formatMoney(line.totalCents)}
								</p>
							</div>
						</HairlineRow>
					))}
				</HairlineList>

				{shortfalls.length > 0 ? (
					<p
						role="status"
						className="border-danger text-danger mt-4 rounded-md border px-4 py-3 text-sm">
						{shortfalls
							.map(
								(short) =>
									`${short.product.name} is ordered ${short.minimum} at a time, and you have ${short.qty}.`,
							)
							.join(" ")}
					</p>
				) : null}

				{isCustomOnly ? null : (
					<Link
						href="/shop"
						className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
						Add something else
					</Link>
				)}
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

			<Step
				n={settings.deliveryEnabled ? "05" : "04"}
				id="custom"
				title="Anything I should know">
				<div className="flex flex-col gap-5">
					<Field
						label="Allergies or notes"
						hint="Anything I should avoid, or how you'd like it packed. Allergies especially."
						error={fieldErrors.notes}>
						{(props) => (
							<Textarea
								{...props}
								name="notes"
								rows={3}
							/>
						)}
					</Field>

					<Field
						label={isCustomOnly ? "What would you like?" : "Tell me about your cake"}
						required={isCustomOnly}
						hint="The occasion, roughly how many people, flavours, colours, what it says on top. This is where custom cakes start. The more you tell me, the better I can price it."
						error={fieldErrors.customRequest}>
						{(props) => (
							<Textarea
								{...props}
								name="customRequest"
								rows={5}
								placeholder="e.g. 30th birthday, about 12 people, chocolate, nothing too sweet. Happy Birthday Sam on top."
							/>
						)}
					</Field>

					{/* A picture is usually the whole brief. Most people have one saved
					    already, and the ones who don't have a link to it. */}
					<InspirationPicker
						photos={photos}
						onChange={setPhotos}
						error={fieldErrors.inspirationPhotos}
					/>

					<Field
						label="Or a link to one"
						hint="Pinterest, Instagram, anywhere. One link is plenty."
						error={fieldErrors.inspirationUrl}>
						{(props) => (
							<Input
								{...props}
								name="inspirationUrl"
								type="url"
								inputMode="url"
								autoComplete="off"
								placeholder="https://www.instagram.com/p/…"
								invalid={Boolean(fieldErrors.inspirationUrl)}
							/>
						)}
					</Field>
				</div>
			</Step>

			<div
				ref={errorRef}
				tabIndex={-1}
				className="scroll-mt-24 outline-none">
				{error ? <FormError>{error}</FormError> : null}
			</div>

			{/* Desktop summary. On a phone the sticky bar below does this job. */}
			<div className="hidden flex-col gap-4 sm:flex">
				<Total
					subtotal={subtotal}
					deliveryFee={deliveryFee}
					total={total}
					pending={isCustomOnly}
				/>
				<div>
					<Button
						type="submit"
						size="lg"
						disabled={pending || !canSubmit}>
						{pending ? "Sending…" : isCustomOnly ? "Ask about this cake" : "Send order request"}
					</Button>
				</div>
				<p className="text-cocoa-soft text-xs">
					This is a request, not a payment. I&rsquo;ll email you to confirm, with a price and where
					to send it.
				</p>
			</div>

			<div className="border-line bg-paper fixed inset-x-0 bottom-0 z-20 border-t px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
				<div className="mb-2 flex items-baseline justify-between">
					<span className="text-cocoa-soft text-xs">
						{chosenDate ? formatDateShort(chosenDate.date) : "Choose a date"}
					</span>
					<span className={isCustomOnly ? "text-cocoa-soft text-xs" : "font-display text-xl"}>
						{isCustomOnly ? "Price to follow" : formatMoney(total)}
					</span>
				</div>
				<Button
					type="submit"
					size="lg"
					className="w-full"
					disabled={pending || !canSubmit}>
					{pending ? "Sending…" : isCustomOnly ? "Ask about this cake" : "Send order request"}
				</Button>
			</div>
		</form>
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
	pending,
}: {
	subtotal: number;
	deliveryFee: number;
	total: number;
	/** True when the order is custom work with no price on it yet. */
	pending: boolean;
}) {
	return (
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
				<dt className="font-medium">Total</dt>
				<dd className={pending ? "text-cocoa-soft text-sm" : "font-display text-2xl"}>
					{pending ? "I'll send you a price" : formatMoney(total)}
				</dd>
			</HairlineRow>
		</HairlineList>
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
