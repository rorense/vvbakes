"use client";

import { useCallback, useSyncExternalStore } from "react";
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

/**
 * What makes a line its own line: the product, and which flavour of it.
 *
 * Two flavours of one cake are two lines with their own quantities and their
 * own prices, so everything that adds, sets or removes has to match on the pair
 * rather than on the product alone. A product with no variants has one line, as
 * it always did.
 */
export function cartLineKey(productId: string, variantId?: string | null): string {
	return `${productId}:${variantId ?? ""}`;
}

function keyOf(line: CartLine): string {
	return cartLineKey(line.productId, line.variantId);
}

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
		// `variantId` is left exactly as found, including absent, which is what a
		// cart saved before variants existed looks like. Whether it still names a
		// flavour that exists is decided against the live catalogue, not here.
		const lines = (parsed as Cart).lines.filter(
			(line): line is CartLine =>
				typeof line?.productId === "string" &&
				(line.variantId === undefined ||
					line.variantId === null ||
					typeof line.variantId === "string") &&
				Number.isInteger(line?.qty) &&
				line.qty > 0,
		);
		return { v: 1, lines };
	} catch {
		return EMPTY;
	}
}

function readCart(): Cart {
	if (typeof window === "undefined") return EMPTY;
	try {
		return parse(window.localStorage.getItem(CART_STORAGE_KEY));
	} catch {
		return EMPTY;
	}
}

function writeCart(cart: Cart): void {
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
function addToCart(productId: string, qty: number, variantId: string | null): Cart {
	const cart = readCart();
	const key = cartLineKey(productId, variantId);
	const existing = cart.lines.find((line) => keyOf(line) === key);
	const next: Cart = existing
		? {
				v: 1,
				lines: cart.lines.map((line) =>
					keyOf(line) === key ? { ...line, qty: line.qty + qty } : line,
				),
			}
		: { v: 1, lines: [...cart.lines, { productId, variantId, qty }] };

	writeCart(next);
	return next;
}

function setCartQty(productId: string, qty: number, variantId: string | null): Cart {
	const cart = readCart();
	const key = cartLineKey(productId, variantId);
	const next: Cart = {
		v: 1,
		lines:
			qty <= 0
				? cart.lines.filter((line) => keyOf(line) !== key)
				: cart.lines.map((line) => (keyOf(line) === key ? { ...line, qty } : line)),
	};
	writeCart(next);
	return next;
}

function removeFromCart(productId: string, variantId: string | null): Cart {
	return setCartQty(productId, 0, variantId);
}

/**
 * The snapshot React reads. Cached against the raw stored string so repeated
 * reads return the identical object, useSyncExternalStore compares by
 * reference and would loop forever on a fresh object each time.
 */
let cachedRaw: string | null = null;
let cachedCart: Cart = EMPTY;

function getSnapshot(): Cart {
	let raw: string | null = null;
	try {
		raw = window.localStorage.getItem(CART_STORAGE_KEY);
	} catch {
		raw = null;
	}
	if (raw !== cachedRaw) {
		cachedRaw = raw;
		cachedCart = parse(raw);
	}
	return cachedCart;
}

/** The server has no localStorage, so it renders an empty cart. */
function getServerSnapshot(): Cart {
	return EMPTY;
}

function subscribe(onChange: () => void): () => void {
	window.addEventListener(CART_EVENT, onChange);
	// `storage` fires in other tabs, so a cart edited in one tab updates here too.
	window.addEventListener("storage", onChange);
	return () => {
		window.removeEventListener(CART_EVENT, onChange);
		window.removeEventListener("storage", onChange);
	};
}

const alwaysReady = () => true;
const neverReady = () => false;

/**
 * Subscribes to the cart.
 *
 * useSyncExternalStore rather than an effect: localStorage is exactly the kind
 * of external store it exists for, and giving the server an explicitly empty
 * snapshot means hydration cannot mismatch.
 *
 * `ready` is false during the server render and true from the first client
 * render, which is what stops "your order is empty" flashing before the cart
 * has been read.
 */
export function useCart(): {
	cart: Cart;
	ready: boolean;
	setQty: (productId: string, qty: number, variantId?: string | null) => void;
	add: (productId: string, qty: number, variantId?: string | null) => void;
	remove: (productId: string, variantId?: string | null) => void;
	clear: () => void;
} {
	const cart = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	const ready = useSyncExternalStore(subscribe, alwaysReady, neverReady);

	return {
		cart,
		ready,
		setQty: useCallback((productId: string, qty: number, variantId: string | null = null) => {
			setCartQty(productId, qty, variantId);
		}, []),
		add: useCallback((productId: string, qty: number, variantId: string | null = null) => {
			addToCart(productId, qty, variantId);
		}, []),
		remove: useCallback((productId: string, variantId: string | null = null) => {
			removeFromCart(productId, variantId);
		}, []),
		clear: useCallback(() => {
			clearCart();
		}, []),
	};
}
