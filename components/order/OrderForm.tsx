"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { placeOrder, type PlaceOrderState } from "@/app/(site)/order/actions";
import { clearCart, useCart } from "@/lib/cart";
import { cn } from "@/lib/cn";
import { formatDateShort, groupByWeek, type IsoDate } from "@/lib/dates";
import { formatMoney, isValidQty, minQty, priceProduct } from "@/lib/pricing";
import type { PickableDate, Product, SiteSettings } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Field, FormError, Input, Textarea } from "@/components/ui/Form";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { Stepper } from "@/components/ui/Stepper";
import { ProductImage } from "@/components/site/ProductCard";

const INITIAL: PlaceOrderState = { result: null };

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
	settings,
}: {
	products: Product[];
	dates: PickableDate[];
	settings: SiteSettings;
}) {
	const router = useRouter();
	const { cart, ready, setQty, remove } = useCart();
	const [state, formAction, pending] = useActionState(placeOrder, INITIAL);

	// The chosen date is stored, but the value actually used is always checked
	// against the dates on offer — derived rather than synced, so it can never
	// point at a date that has gone.
	const [chosenDateValue, setChosenDateValue] = useState<IsoDate | "">("");
	const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup");

	// When the form was opened, used to reject submissions no human could have
	// completed that fast. Held in a ref written from an effect: the clock is an
	// external system, so reading it during render is not allowed, and a hidden
	// input is no good either — React re-applies its value on every re-render,
	// which happens on every quantity change.
	const openedAt = useRef(0);
	const errorRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		openedAt.current = Date.now();
	}, []);

	// Stamps the timestamp on the way out. Reading a ref in an event handler is
	// exactly where refs are meant to be read.
	const action = (formData: FormData) => {
		formData.set("startedAt", String(openedAt.current));
		return formAction(formData);
	};

	const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

	// Cart lines resolved against the live catalogue. A product that has since
	// been deleted or sold out drops out here rather than failing on submit.
	const lines = useMemo(
		() =>
			cart.lines
				.map((line) => {
					const product = byId.get(line.productId);
					if (!product || !product.isAvailable) return null;
					if (!isValidQty(product, line.qty)) return null;
					return { product, qty: line.qty, ...priceProduct(product, line.qty) };
				})
				.filter((line): line is NonNullable<typeof line> => line !== null),
		[cart.lines, byId],
	);

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

	// Move focus to the error so it is announced and not scrolled past.
	useEffect(() => {
		if (state.result && !state.result.ok) {
			errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
			errorRef.current?.focus();
		}
	}, [state.result]);

	const fieldErrors = state.result && !state.result.ok ? (state.result.fieldErrors ?? {}) : {};

	if (ready && lines.length === 0) {
		return <EmptyOrder droppedCount={droppedCount} />;
	}

	return (
		<form
			action={action}
			className="flex flex-col gap-12 pb-28 sm:pb-0">
			{/* Hidden state. The cart is a client-side thing; this is how it reaches
			    the server without a round trip per change. */}
			<input
				type="hidden"
				name="items"
				value={JSON.stringify(lines.map((line) => ({ productId: line.product.id, qty: line.qty })))}
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
				title="Your treats">
				{droppedCount > 0 ? (
					<p className="border-line bg-paper-deep mb-4 rounded-md border px-4 py-3 text-sm">
						{droppedCount === 1 ? "An item" : `${droppedCount} items`} in your order
						{droppedCount === 1 ? " is" : " are"} no longer available and{" "}
						{droppedCount === 1 ? "has" : "have"} been removed.
					</p>
				) : null}

				<HairlineList>
					{lines.map((line) => (
						<HairlineRow
							key={line.product.id}
							align="center"
							className="flex-col gap-3 sm:flex-row sm:gap-4">
							<div className="flex w-full min-w-0 flex-1 items-start gap-4">
								<div className="bg-paper-deep relative size-16 shrink-0 overflow-hidden rounded-md">
									<ProductImage
										product={line.product}
										sizes="64px"
									/>
								</div>
								<div className="flex min-w-0 flex-col gap-0.5">
									<Link
										href={`/shop/${line.product.slug}`}
										className="font-medium hover:underline">
										{line.product.name}
									</Link>
									<p className="text-cocoa-soft text-xs">{line.note}</p>
									<button
										type="button"
										onClick={() => remove(line.product.id)}
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
									max={line.product.maxPerOrder}
									step={line.product.qtyStep}
									label={line.product.name}
									onChange={(next) =>
										setQty(line.product.id, next < minQty(line.product) ? 0 : next)
									}
								/>
								<p className="font-display w-16 text-right text-lg">
									{formatMoney(line.totalCents)}
								</p>
							</div>
						</HairlineRow>
					))}
				</HairlineList>

				<Link
					href="/shop"
					className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
					Add something else
				</Link>
			</Step>

			<Step
				n="02"
				title={fulfilment === "delivery" ? "Delivery date" : "Pickup date"}>
				<PickupDatePicker
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
				title="Anything else">
				<div className="flex flex-col gap-5">
					<Field
						label="Allergies or notes"
						hint="Tell us about any allergies, or how you'd like things packed."
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
						label="Custom request"
						hint="Writing on a cake, a flavour you're after, a birthday to work around."
						error={fieldErrors.customRequest}>
						{(props) => (
							<Textarea
								{...props}
								name="customRequest"
								rows={3}
							/>
						)}
					</Field>
				</div>
			</Step>

			<div
				ref={errorRef}
				tabIndex={-1}
				className="scroll-mt-24 outline-none">
				{state.result && !state.result.ok ? <FormError>{state.result.error}</FormError> : null}
			</div>

			{/* Desktop summary. On a phone the sticky bar below does this job. */}
			<div className="hidden flex-col gap-4 sm:flex">
				<Total
					subtotal={subtotal}
					deliveryFee={deliveryFee}
					total={total}
				/>
				<div>
					<Button
						type="submit"
						size="lg"
						disabled={pending || !pickupDate}>
						{pending ? "Sending your order…" : "Send order request"}
					</Button>
				</div>
				<p className="text-cocoa-soft text-xs">
					This is a request, not a payment. We&rsquo;ll email you to confirm, with bank details and
					a reference.
				</p>
			</div>

			<div className="border-line bg-paper fixed inset-x-0 bottom-0 z-20 border-t px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
				<div className="mb-2 flex items-baseline justify-between">
					<span className="text-cocoa-soft text-xs">
						{chosenDate ? formatDateShort(chosenDate.date) : "Choose a date"}
					</span>
					<span className="font-display text-xl">{formatMoney(total)}</span>
				</div>
				<Button
					type="submit"
					size="lg"
					className="w-full"
					disabled={pending || !pickupDate}>
					{pending ? "Sending…" : "Send order request"}
				</Button>
			</div>
		</form>
	);
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
	return (
		<section className="flex flex-col gap-5">
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
}: {
	subtotal: number;
	deliveryFee: number;
	total: number;
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
				<dd className="font-display text-2xl">{formatMoney(total)}</dd>
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

/**
 * Pickup dates as pills, grouped into the weeks they fall in.
 *
 * Only bookable dates appear at all — a date that is full or closed is simply
 * not there. Offering a date and then rejecting it is a worse experience than
 * never offering it, and the database enforces the same rule anyway.
 */
function PickupDatePicker({
	dates,
	value,
	onChange,
	leadTimeDays,
}: {
	dates: PickableDate[];
	value: string;
	onChange: (date: IsoDate) => void;
	leadTimeDays: number;
}) {
	const weeks = useMemo(() => groupByWeek(dates), [dates]);

	if (dates.length === 0) {
		return (
			<p className="border-line bg-paper-deep rounded-md border px-4 py-3 text-sm">
				There are no dates open for booking at the moment. Follow along on Instagram — we post when
				new dates go up.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<fieldset className="flex flex-col gap-4">
				<legend className="sr-only">Choose a pickup date</legend>
				{weeks.map((week) => (
					<div
						key={week[0]!.date}
						className="flex flex-wrap gap-2">
						{week.map((date) => {
							const selected = date.date === value;
							return (
								<label
									key={date.date}
									className={cn(
										"flex cursor-pointer flex-col items-start gap-0.5 rounded-md border px-4 py-3 transition-colors",
										selected
											? "border-cocoa bg-rose"
											: "border-line hover:border-cocoa hover:bg-paper-deep",
									)}>
									<input
										type="radio"
										name="pickupDateChoice"
										className="sr-only"
										checked={selected}
										onChange={() => onChange(date.date)}
									/>
									<span className="text-sm font-medium">{formatDateShort(date.date)}</span>
									{date.note ? (
										<span className="text-cocoa-soft text-2xs">{date.note}</span>
									) : date.remaining <= 2 ? (
										<span className="text-cocoa-soft text-2xs">
											{date.remaining} {date.remaining === 1 ? "spot" : "spots"} left
										</span>
									) : null}
								</label>
							);
						})}
					</div>
				))}
			</fieldset>

			{leadTimeDays > 0 ? (
				<p className="text-cocoa-soft text-xs">
					We need {leadTimeDays} day{leadTimeDays === 1 ? "" : "s"} notice, so the earliest dates
					aren&rsquo;t shown.
				</p>
			) : null}
		</div>
	);
}

function EmptyOrder({ droppedCount }: { droppedCount: number }) {
	return (
		<div className="flex flex-col items-start gap-4">
			<p className="font-display text-3xl">Your order is empty</p>
			<p className="text-cocoa-soft">
				{droppedCount > 0
					? "What you had saved isn't available any more. Have another look and we'll start again."
					: "Pick a few things from the shop and they'll show up here."}
			</p>
			<Link
				href="/shop"
				className="bg-rose hover:bg-rose-deep rounded-pill px-6 py-3 text-sm font-medium transition-colors">
				Browse the shop
			</Link>
		</div>
	);
}
