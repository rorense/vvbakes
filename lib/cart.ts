"use client";

import { useCallback, useSyncExternalStore } from "react";
import { briefKey, briefPhotoIds, normaliseBrief } from "./brief";
import { CART_STORAGE_KEY } from "./constants";
import { deletePhotos } from "./photo-store";
import { normaliseExtraIds } from "./pricing";
import type { Cart, CartBrief, CartLine } from "./types";

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
 * What makes a line its own line: the product, which flavour of it, what was
 * added to it, and what was said about it.
 *
 * Two flavours of one cake are two lines with their own quantities and their own
 * prices; so are the same cake with candles and without; and so are two custom
 * cakes described differently, however alike the rest of the line looks.
 * Everything that adds, sets or removes has to match on all four rather than on
 * the product alone. A product with no variants, nothing added and nothing said
 * has one line, as it always did: the three extra parts of the key are empty.
 *
 * The extras are sorted and de-duplicated first, so picking candles then a gift
 * box lands on the same line as picking them the other way round. `place_order`
 * reduces them the same way and groups by the brief the same way, which is what
 * keeps the browser's idea of the lines and the database's the same.
 */
export function cartLineKey(
	productId: string,
	variantId?: string | null,
	extraIds?: readonly string[] | null,
	brief?: CartBrief | null,
): string {
	return [productId, variantId ?? "", normaliseExtraIds(extraIds).join(","), briefKey(brief)].join(
		":",
	);
}

function keyOf(line: CartLine): string {
	return cartLineKey(line.productId, line.variantId, line.extraIds, line.brief);
}

/** Notifies other hooks in this tab; `storage` only fires in *other* tabs. */
const CART_EVENT = "vvbakes:cart-changed";

/**
 * True when `value` is a brief, or is absent.
 *
 * Only the shape is checked. Trimming and the length caps are `normaliseBrief`'s
 * job and happen on the way in, so a line already in storage is taken as it is
 * rather than rewritten by a read.
 */
function isBriefShaped(value: unknown): value is CartBrief | undefined {
	if (value === undefined || value === null) return true;
	if (typeof value !== "object") return false;

	const brief = value as CartBrief;
	return (
		(brief.note === undefined || typeof brief.note === "string") &&
		(brief.inspirationUrl === undefined || typeof brief.inspirationUrl === "string") &&
		(brief.photoIds === undefined ||
			(Array.isArray(brief.photoIds) && brief.photoIds.every((id) => typeof id === "string")))
	);
}

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
		// `variantId`, `extraIds` and `brief` are left exactly as found, including
		// absent, which is what a cart saved before any of them existed looks
		// like. Whether they still name things that exist is decided against the
		// live catalogue and the photo store, not here.
		const lines = (parsed as Cart).lines.filter(
			(line): line is CartLine =>
				typeof line?.productId === "string" &&
				(line.variantId === undefined ||
					line.variantId === null ||
					typeof line.variantId === "string") &&
				(line.extraIds === undefined ||
					(Array.isArray(line.extraIds) && line.extraIds.every((id) => typeof id === "string"))) &&
				isBriefShaped(line.brief) &&
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

/**
 * Empties the cart and the photos it was holding.
 *
 * The photos go too because nothing else will ever ask for them: the cart is
 * the only record of which ids were wanted, so a cart emptied without this
 * leaves the files in the browser for good.
 */
export function clearCart(): void {
	const going = readCart().lines.flatMap((line) => briefPhotoIds(line.brief));
	writeCart(EMPTY);
	void deletePhotos(going);
}

/** Adds to an existing line rather than duplicating it. */
function addToCart(
	productId: string,
	qty: number,
	variantId: string | null,
	extraIds: string[],
	brief: CartBrief | undefined,
): Cart {
	const cart = readCart();
	const clean = normaliseBrief(brief);
	const key = cartLineKey(productId, variantId, extraIds, clean);
	const existing = cart.lines.find((line) => keyOf(line) === key);
	const next: Cart = existing
		? {
				v: 1,
				lines: cart.lines.map((line) =>
					keyOf(line) === key ? { ...line, qty: line.qty + qty } : line,
				),
			}
		: {
				v: 1,
				lines: [
					...cart.lines,
					// Stored already sorted, de-duplicated and trimmed, so a line saved
					// today and the same line saved tomorrow are the same key however
					// the picker happened to hand them over.
					{
						productId,
						variantId,
						extraIds: normaliseExtraIds(extraIds),
						...(clean ? { brief: clean } : {}),
						qty,
					},
				],
			};

	writeCart(next);
	return next;
}

function setCartQty(
	productId: string,
	qty: number,
	variantId: string | null,
	extraIds: string[],
	brief: CartBrief | undefined,
): Cart {
	const cart = readCart();
	const key = cartLineKey(productId, variantId, extraIds, brief);
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

/**
 * Takes a line out, and its photos with it.
 *
 * Removing is the one moment those files are certainly unwanted — a quantity
 * going to zero is the same thing — so this is where they are let go rather
 * than left for the sweep the order page runs.
 */
function removeFromCart(
	productId: string,
	variantId: string | null,
	extraIds: string[],
	brief: CartBrief | undefined,
): Cart {
	const next = setCartQty(productId, 0, variantId, extraIds, brief);
	void deletePhotos(briefPhotoIds(brief));
	return next;
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
	setQty: (
		productId: string,
		qty: number,
		variantId?: string | null,
		extraIds?: string[],
		brief?: CartBrief,
	) => void;
	add: (
		productId: string,
		qty: number,
		variantId?: string | null,
		extraIds?: string[],
		brief?: CartBrief,
	) => void;
	remove: (
		productId: string,
		variantId?: string | null,
		extraIds?: string[],
		brief?: CartBrief,
	) => void;
	clear: () => void;
} {
	const cart = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	const ready = useSyncExternalStore(subscribe, alwaysReady, neverReady);

	return {
		cart,
		ready,
		setQty: useCallback(
			(
				productId: string,
				qty: number,
				variantId: string | null = null,
				extraIds: string[] = [],
				brief?: CartBrief,
			) => {
				setCartQty(productId, qty, variantId, extraIds, brief);
			},
			[],
		),
		add: useCallback(
			(
				productId: string,
				qty: number,
				variantId: string | null = null,
				extraIds: string[] = [],
				brief?: CartBrief,
			) => {
				addToCart(productId, qty, variantId, extraIds, brief);
			},
			[],
		),
		remove: useCallback(
			(
				productId: string,
				variantId: string | null = null,
				extraIds: string[] = [],
				brief?: CartBrief,
			) => {
				removeFromCart(productId, variantId, extraIds, brief);
			},
			[],
		),
		clear: useCallback(() => {
			clearCart();
		}, []),
	};
}
