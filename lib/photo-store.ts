"use client";

import { PHOTO_STORE_NAME, PHOTO_STORE_VERSION } from "./constants";

/**
 * Where a customer's inspiration photos wait between the product page and the
 * order they are attached to.
 *
 * The brief is written on the product page now, so the photos have to survive a
 * navigation, a closed tab and a night's sleep before the order is submitted —
 * and they still must not be uploaded in the meantime. Uploading early would
 * hand an anonymous visitor a storage endpoint of their own to point a script
 * at, which is the one thing the design has avoided from the start: a photo
 * only ever reaches the bucket as part of a submission that has already passed
 * the honeypot, the timing check and the per-address rate limit.
 *
 * So they wait in the browser, in IndexedDB. Not localStorage: that holds
 * strings, so a photo would have to be base64'd at a third again its size, and
 * three references off a phone would sit on most of a 5 MB quota and start
 * throwing — silently taking the whole cart with them, since the cart shares
 * that quota. IndexedDB stores the Blob as a Blob and has room for it.
 *
 * Everything here tolerates the database being unavailable, exactly as the cart
 * tolerates localStorage being unavailable: private windows, blocked site data
 * and browsers that throw on access all end up with no photos rather than a
 * crash. A brief without its photos is still a brief — the note and the link
 * are in the cart itself and go through regardless.
 */

const STORE = "photos";

/** A photo as it waits, with enough to rebuild the File on the way out. */
interface StoredPhoto {
	id: string;
	blob: Blob;
	name: string;
	type: string;
	savedAt: number;
}

function open(): Promise<IDBDatabase | null> {
	if (typeof indexedDB === "undefined") return Promise.resolve(null);

	return new Promise((resolve) => {
		let request: IDBOpenDBRequest;
		try {
			request = indexedDB.open(PHOTO_STORE_NAME, PHOTO_STORE_VERSION);
		} catch {
			resolve(null);
			return;
		}

		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE)) {
				request.result.createObjectStore(STORE, { keyPath: "id" });
			}
		};
		request.onsuccess = () => resolve(request.result);
		// Blocked, denied, or a version we cannot open. No photos, no crash.
		request.onerror = () => resolve(null);
		request.onblocked = () => resolve(null);
	});
}

/**
 * Runs one transaction and closes the connection.
 *
 * Opening per call rather than holding a connection open: these happen a
 * handful of times in a session, and a held connection blocks an upgrade in
 * another tab, which is the one failure mode that would need a page reload to
 * clear.
 */
async function withStore<T>(
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest | IDBRequest[],
	fallback: T,
): Promise<T> {
	const db = await open();
	if (!db) return fallback;

	try {
		return await new Promise<T>((resolve) => {
			let transaction: IDBTransaction;
			try {
				transaction = db.transaction(STORE, mode);
			} catch {
				resolve(fallback);
				return;
			}

			const requests = run(transaction.objectStore(STORE));
			const list = Array.isArray(requests) ? requests : [requests];

			transaction.oncomplete = () => {
				resolve(
					(Array.isArray(requests) ? list.map((request) => request.result) : list[0]?.result) as T,
				);
			};
			transaction.onerror = () => resolve(fallback);
			transaction.onabort = () => resolve(fallback);
		});
	} finally {
		db.close();
	}
}

function newId(): string {
	// `randomUUID` is unavailable on http origins other than localhost, which is
	// exactly where someone reviews this on a phone over a LAN address.
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Files in, ids out.
 *
 * The ids are what the cart line carries. Anything that fails to store is left
 * out of the result rather than reported, so a line ends up naming only photos
 * that are really there — a cart line pointing at a photo that was never saved
 * would show a gap on the order page with nothing to say about it.
 */
export async function savePhotos(files: File[]): Promise<string[]> {
	if (files.length === 0) return [];

	const rows: StoredPhoto[] = files.map((file) => ({
		id: newId(),
		blob: file,
		name: file.name,
		type: file.type,
		savedAt: Date.now(),
	}));

	const stored = await withStore<unknown[]>(
		"readwrite",
		(store) => rows.map((row) => store.put(row)),
		[],
	);

	return stored.length === rows.length ? rows.map((row) => row.id) : [];
}

/**
 * The photos these ids name, keyed by id, in whatever order they come back.
 *
 * Tolerant of an id that names nothing, for the same reason `findVariant` is
 * tolerant of a deleted flavour: the cart outlives the store it points into, and
 * a browser that cleared its site data leaves a line naming photos that are
 * gone. The caller decides what to do with the gap; the order form says so and
 * sends the rest.
 */
export async function loadPhotos(ids: string[]): Promise<Map<string, File>> {
	const found = new Map<string, File>();
	if (ids.length === 0) return found;

	const rows = await withStore<Array<StoredPhoto | undefined>>(
		"readonly",
		(store) => ids.map((id) => store.get(id)),
		[],
	);

	for (const row of rows) {
		if (!row?.blob) continue;
		found.set(row.id, new File([row.blob], row.name, { type: row.type || row.blob.type }));
	}

	return found;
}

/** Forgets these photos. Used when a line is removed or its brief edited. */
export async function deletePhotos(ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	await withStore<unknown[]>("readwrite", (store) => ids.map((id) => store.delete(id)), []);
}

/**
 * Drops every photo the cart no longer names.
 *
 * Run when the order page loads, which is the one moment the whole cart is in
 * hand. Without it a photo attached to a line and then removed would sit in the
 * browser for good: the cart is the only record of which ids are still wanted,
 * so nothing else is in a position to notice.
 */
export async function sweepPhotos(keep: readonly string[]): Promise<void> {
	const wanted = new Set(keep);

	const db = await open();
	if (!db) return;

	try {
		await new Promise<void>((resolve) => {
			let transaction: IDBTransaction;
			try {
				transaction = db.transaction(STORE, "readwrite");
			} catch {
				resolve();
				return;
			}

			const cursor = transaction.objectStore(STORE).openCursor();
			cursor.onsuccess = () => {
				const at = cursor.result;
				if (!at) return;
				if (!wanted.has(String(at.key))) at.delete();
				at.continue();
			};

			transaction.oncomplete = () => resolve();
			transaction.onerror = () => resolve();
			transaction.onabort = () => resolve();
		});
	} finally {
		db.close();
	}
}
