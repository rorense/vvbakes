"use client";

import imageCompression from "browser-image-compression";
import { useId, useRef, useState } from "react";
import { MAX_INSPIRATION_PHOTOS } from "@/lib/constants";

/** A chosen photo and the object URL showing it back. */
export interface InspirationPhoto {
	file: File;
	/**
	 * Created the moment the photo is chosen and revoked when it is removed.
	 * Minting it in the event handler rather than during a render or an effect
	 * means there is exactly one URL per photo, however often this re-renders.
	 * Whatever is still held when the page goes away dies with the document.
	 */
	preview: string;
}

/**
 * Photos a customer sends with a custom cake request.
 *
 * Nothing is uploaded here. The compressed files are handed back to the order
 * form and travel with the order itself, so an unauthenticated visitor never
 * has a storage endpoint of their own to point a script at: a photo only ever
 * reaches the bucket as part of a submission that has already passed the
 * honeypot, the timing check and the per-address rate limit.
 *
 * Re-encoding to WebP in the browser is what makes that possible. Cake
 * references come off a phone or a screenshot at four or five megabytes; three
 * of those would not fit in a server action's body at all.
 */
export function InspirationPicker({
	photos,
	onChange,
	error,
}: {
	photos: InspirationPhoto[];
	onChange: (photos: InspirationPhoto[]) => void;
	/** What the server said about these photos, if it refused them. */
	error?: string;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const headingId = useId();
	const [working, setWorking] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	const remaining = MAX_INSPIRATION_PHOTOS - photos.length;

	async function handleFiles(chosen: File[]) {
		setWorking(true);
		setMessage(null);

		const accepted = chosen.slice(0, remaining);
		const tooMany = chosen.length > accepted.length;

		try {
			const added = await Promise.all(
				accepted.map(async (file) => {
					const compressed = await imageCompression(file, {
						maxWidthOrHeight: 1400,
						maxSizeMB: 0.4,
						fileType: "image/webp",
						useWebWorker: true,
					});
					return { file: compressed, preview: URL.createObjectURL(compressed) };
				}),
			);

			onChange([...photos, ...added]);
			setMessage(
				tooMany
					? `Only the first ${remaining === 1 ? "one" : remaining} went on. ${MAX_INSPIRATION_PHOTOS} photos is the most I can take.`
					: null,
			);
		} catch {
			setMessage("That photo wouldn't load. A JPEG, PNG or WebP should work.");
		} finally {
			setWorking(false);
		}
	}

	function remove(index: number) {
		const going = photos[index];
		if (going) URL.revokeObjectURL(going.preview);
		onChange(photos.filter((_, at) => at !== index));
	}

	return (
		/* A labelled group rather than a bare stack: the file input is off-screen
		   and the button is what anybody actually reaches, so without this the
		   only thing announced is "Choose photos", with no idea of what for. */
		<div
			role="group"
			aria-labelledby={headingId}
			className="flex flex-col gap-3">
			<span
				id={headingId}
				className="text-sm font-medium">
				Photos for inspiration
				<span className="text-cocoa-soft text-xs font-normal"> (optional)</span>
			</span>

			{photos.length > 0 ? (
				<ul className="flex flex-wrap gap-3">
					{photos.map((photo, index) => (
						<li
							key={photo.preview}
							className="flex flex-col items-center gap-1">
							<div className="border-line bg-paper-deep size-24 overflow-hidden rounded-md border">
								{/* eslint-disable-next-line @next/next/no-img-element -- a blob:
								    URL for a file that never leaves the browser; next/image
								    would try to optimise something it cannot fetch. */}
								<img
									src={photo.preview}
									alt={`Inspiration photo ${index + 1}`}
									className="size-full object-cover"
								/>
							</div>
							<button
								type="button"
								onClick={() => remove(index)}
								className="text-cocoa-soft hover:text-danger text-xs underline underline-offset-2">
								Remove
							</button>
						</li>
					))}
				</ul>
			) : null}

			<input
				ref={inputRef}
				type="file"
				accept="image/jpeg,image/png,image/webp,image/heic"
				multiple
				className="sr-only"
				onChange={(event) => {
					const chosen = Array.from(event.target.files ?? []);
					if (chosen.length > 0) void handleFiles(chosen);
					event.target.value = "";
				}}
			/>

			{remaining > 0 ? (
				<button
					type="button"
					disabled={working}
					onClick={() => inputRef.current?.click()}
					className="border-line hover:border-cocoa hover:bg-paper-deep rounded-pill min-h-11 w-fit border px-5 text-sm font-medium transition-colors disabled:opacity-50">
					{working ? "Adding…" : photos.length > 0 ? "Add another" : "Choose photos"}
				</button>
			) : null}

			<p className="text-cocoa-soft text-xs">
				{photos.length > 0
					? `${photos.length} of ${MAX_INSPIRATION_PHOTOS} added. Big files are fine, they get resized here before sending.`
					: `A cake you've seen, a colour, the handwriting you want on top. Up to ${MAX_INSPIRATION_PHOTOS}.`}
			</p>

			{(message ?? error) ? (
				<p
					role="status"
					className="text-danger text-xs font-medium">
					{message ?? error}
				</p>
			) : null}
		</div>
	);
}
