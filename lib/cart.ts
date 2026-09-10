"use client";

import { useCallback, useEffect, useState } from "react";
import { CART_STORAGE_KEY } from "./constants";
import type { Cart, CartLine } from "./types";

/**
 * The cart lives in localStorage, not on the server.
 *
 * There are no customer accounts, so there is nothing to attach a server-side
 * cart to, and a cart is not worth a database row until it becomes an order.
 * The trade-off is that a cart does not follow someone to another device, which
 * for a bakery ordering two days ahead is fine.
 *
 * Everything here tolerates storage being unavailable: private windows, blocked
 * site data, and browsers that throw on access all end up with an empty cart
 * rather than a crash.
 */

const EMPTY: Cart = { v: 1, lines: [] };

/** Notifies other hooks in this tab; `storage` only fires in *other* tabs. */
const CART_EVENT = "vvbakes:cart-changed";

function parse(raw: string | null): Cart {
	if (!raw) return EMPTY;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			(parsed as Cart).v !== 1 ||
			!Array.isArray((parsed as Cart).lines)
		) {
			return EMPTY;
		}
		const lines = (parsed as Cart).lines.filter(
			(line): line is CartLine =>
				typeof line?.productId === "string" && Number.isInteger(line?.qty) && line.qty > 0,
		);
		return { v: 1, lines };
	} catch {
		return EMPTY;
	}
}

export function readCart(): Cart {
	if (typeof window === "undefined") return EMPTY;
	try {
		return parse(window.localStorage.getItem(CART_STORAGE_KEY));
	} catch {
		return EMPTY;
	}
}

export function writeCart(cart: Cart): void {
	if (typeof window === "undefined") return;
	try {
		if (cart.lines.length === 0) {
			window.localStorage.removeItem(CART_STORAGE_KEY);
		} else {
			window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
		}
	} catch {
		// Storage unavailable. The cart still works for this page view.
	}
	window.dispatchEvent(new CustomEvent(CART_EVENT));
}

export function clearCart(): void {
	writeCart(EMPTY);
}

/** Adds to an existing line rather than duplicating it. */
export function addToCart(productId: string, qty: number): Cart {
	const cart = readCart();
	const existing = cart.lines.find((line) => line.productId === productId);
	const next: Cart = existing
		? {
				v: 1,
				lines: cart.lines.map((line) =>
					line.productId === productId ? { ...line, qty: line.qty + qty } : line,
				),
			}
		: { v: 1, lines: [...cart.lines, { productId, qty }] };

	writeCart(next);
	return next;
}

export function setCartQty(productId: string, qty: number): Cart {
	const cart = readCart();
	const next: Cart = {
		v: 1,
		lines:
			qty <= 0
				? cart.lines.filter((line) => line.productId !== productId)
				: cart.lines.map((line) => (line.productId === productId ? { ...line, qty } : line)),
	};
	writeCart(next);
	return next;
}

export function removeFromCart(productId: string): Cart {
	return setCartQty(productId, 0);
}

export function cartCount(cart: Cart): number {
	return cart.lines.reduce((total, line) => total + line.qty, 0);
}

/**
 * Subscribes to the cart. Starts empty and fills in after mount so the server
 * and client render the same markup — a cart read during render would produce a
 * hydration mismatch on every page that shows a count.
 */
export function useCart(): {
	cart: Cart;
	ready: boolean;
	setQty: (productId: string, qty: number) => void;
	add: (productId: string, qty: number) => void;
	remove: (productId: string) => void;
	clear: () => void;
} {
	const [cart, setCart] = useState<Cart>(EMPTY);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		setCart(readCart());
		setReady(true);

		const sync = () => setCart(readCart());
		window.addEventListener(CART_EVENT, sync);
		window.addEventListener("storage", sync);
		return () => {
			window.removeEventListener(CART_EVENT, sync);
			window.removeEventListener("storage", sync);
		};
	}, []);

	return {
		cart,
		ready,
		setQty: useCallback(
			(productId: string, qty: number) => setCart(setCartQty(productId, qty)),
			[],
		),
		add: useCallback((productId: string, qty: number) => setCart(addToCart(productId, qty)), []),
		remove: useCallback((productId: string) => setCart(removeFromCart(productId)), []),
		clear: useCallback(() => {
			clearCart();
			setCart(EMPTY);
		}, []),
	};
}
