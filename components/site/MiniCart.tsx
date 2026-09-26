"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { priceBasket } from "@/lib/basket";
import { useCart } from "@/lib/cart";
import type { Product } from "@/lib/types";
import { ButtonLink } from "@/components/ui/Button";
import { NavLinkPending } from "@/components/ui/NavLink";
import { BarTotal } from "@/components/order/BarTotal";

/**
 * The basket, kept at the foot of a phone's screen: how many things are in it,
 * what they come to, and the way to the order form.
 *
 * Below 40rem the header's links are behind the hamburger, so a phone had no
 * sign of what was in the basket anywhere but the order form itself, and the
 * only proof an add had worked was a line of text beside the button that did
 * it. From 40rem up the header's "Order cart" is on show and this stays out of
 * the way, at the same breakpoint the hamburger uses.
 *
 * The figure is the order form's own, worked out by lib/basket.ts against the
 * same catalogue. It leaves out delivery, which is chosen on the order form and
 * nowhere else, so what it prices is the items and nothing more.
 *
 * Not drawn on /order, which carries a bar of its own with this total and the
 * button that sends it, nor on the pages under it, which are about an order
 * that has already been placed. Not drawn for an empty basket either: there is
 * nothing to say, and a bar saying so on every page is a bar in the way.
 */
export function MiniCart({ products }: { products: Product[] }) {
	const pathname = usePathname();
	const { cart, ready } = useCart();

	const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
	const basket = useMemo(() => priceBasket(cart.lines, byId), [cart.lines, byId]);

	// `ready` is false for the server's render and the one that hydrates it, so
	// the bar first appears once the cart has actually been read, and a page
	// never arrives with a bar the server had no way to fill in.
	if (!ready || basket.lines.length === 0 || isOrderPath(pathname)) return null;

	// Lines, as the order form lists them, rather than a sum of quantities: a
	// dozen cupcakes is one thing on the order form, not twelve.
	const count = basket.lines.length;

	return (
		// Sticky rather than fixed, unlike the order form's bar. A sticky bar
		// keeps a place at the end of the page as well as its place on the
		// screen, so at the bottom of the scroll it rests under the footer rather
		// than over it, however many lines it has wrapped to on a narrow phone.
		// A fixed one needs a spacer of the right height to scroll past, and the
		// right height moves with the words in it: a big total beside "+ your
		// cake" takes a third line at 320px.
		<aside
			aria-label="Your order"
			className="basket-rise border-line bg-paper sticky bottom-0 z-20 border-t px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
			<div className="flex items-center justify-between gap-4">
				<div className="flex min-w-0 flex-col">
					<span className="text-cocoa-soft text-xs">
						Your order &middot; {count} {count === 1 ? "item" : "items"}
					</span>
					<BarTotal
						totalCents={basket.subtotalCents}
						hasUnpriced={basket.hasUnpriced}
						mayCostMore={basket.mayCostMore}
					/>
				</div>

				{/* /order is the slowest page on the site, and this bar only exists
				    on a phone, which is exactly where a tap with nothing to show
				    for it gets tapped again. So it wears the header's mark while
				    the page is on its way, in cocoa because rose does not show
				    against a rose button. */}
				<ButtonLink
					href="/order"
					className="relative shrink-0">
					View order
					<NavLinkPending className="bg-cocoa" />
				</ButtonLink>
			</div>
		</aside>
	);
}

/** The order form, and the pages about an order already placed. */
function isOrderPath(pathname: string): boolean {
	return pathname === "/order" || pathname.startsWith("/order/");
}
