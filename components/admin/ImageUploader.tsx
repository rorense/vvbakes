"use client";

import Image from "next/image";
import { useId, useRef, useState } from "react";
import { productImagePath, productImageUrl } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";
import { PRODUCT_IMAGE_BUCKET } from "@/lib/constants";

/**
 * Pulled in only once a file is actually chosen.
 *
 * The encoder is around 50 KB of the page's JavaScript and most visits never
 * attach a photo at all, so a static import would spend that on everyone to
 * serve the few who do. Fetched here the cost lands on the one interaction that
 * needs it, behind a spinner that was going to be shown regardless.
 */
async function loadCompressor() {
	return (await import("browser-image-compression")).default;
}

/**
 * Uploads a product photo straight from the browser to Supabase Storage.
 *
 * The file is resized and re-encoded to WebP here first. Photos come off a phone
 * at four or five megabytes, and sending those through a server action would be
 * slow, would hit the body size limit, and would leave the shop serving huge
 * images. Compressing client-side means a 4 MB photo arrives as roughly 200 KB
 * without the owner having to think about it.
 *
 * The upload runs as the signed-in owner, so the bucket's policies still apply:
 * a visitor with the anon key cannot write here.
 *
 * Two sizes. The large one is the product's own photo and has room to explain
 * itself; the small one sits at the head of a variant row, where a row per
 * flavour on a phone has no room for a paragraph, so the tile itself is the
 * button.
 */
export function ImageUploader({
	slug,
	value,
	onChange,
	size = "md",
	label = "photo",
}: {
	slug: string;
	value: string;
	onChange: (path: string) => void;
	size?: "sm" | "md";
	/** What this photo is of, for screen readers: "Chocolate". */
	label?: string;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const statusId = useId();
	const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
	const [message, setMessage] = useState<string | null>(null);

	const preview = productImageUrl(value);

	async function handleFile(file: File) {
		setStatus("working");
		setMessage(null);

		try {
			const compressed = await (
				await loadCompressor()
			)(file, {
				maxWidthOrHeight: 1600,
				maxSizeMB: 0.6,
				fileType: "image/webp",
				useWebWorker: true,
			});

			const path = productImagePath(slug, "webp");
			const supabase = createClient();

			const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, compressed, {
				contentType: "image/webp",
				cacheControl: "31536000",
				upsert: false,
			});

			if (error) throw error;

			onChange(path);
			setStatus("idle");
			setMessage("Photo uploaded. Remember to save.");
		} catch (error) {
			setStatus("error");
			setMessage(
				error instanceof Error
					? `That photo didn't upload: ${error.message}`
					: "That photo didn't upload.",
			);
		}
	}

	const fileInput = (
		<input
			ref={inputRef}
			type="file"
			accept="image/jpeg,image/png,image/webp"
			className="sr-only"
			onChange={(event) => {
				const file = event.target.files?.[0];
				if (file) void handleFile(file);
				event.target.value = "";
			}}
		/>
	);

	if (size === "sm") {
		return (
			<div className="flex flex-col items-start gap-1">
				{fileInput}

				{/* The tile is the button. A separate "choose a photo" control beside a
				    56px thumbnail would be two things doing one job in a row that is
				    already four fields wide on a phone. */}
				<button
					type="button"
					disabled={status === "working"}
					onClick={() => inputRef.current?.click()}
					aria-describedby={message ? statusId : undefined}
					className="border-line bg-paper-deep hover:border-cocoa relative size-14 shrink-0 overflow-hidden rounded-md border transition-colors disabled:opacity-50">
					{preview ? (
						<Image
							src={preview}
							alt=""
							fill
							sizes="56px"
							className="object-cover"
						/>
					) : (
						<span className="text-cocoa-soft grid h-full place-content-center text-xs">
							{status === "working" ? "…" : "Photo"}
						</span>
					)}
					<span className="sr-only">
						{preview ? `Replace the photo for ${label}` : `Add a photo for ${label}`}
					</span>
				</button>

				{preview ? (
					<button
						type="button"
						onClick={() => {
							onChange("");
							setMessage(null);
						}}
						className="text-cocoa-soft hover:text-danger text-2xs underline underline-offset-2">
						Remove
						<span className="sr-only"> the photo for {label}</span>
					</button>
				) : null}

				{message ? (
					<p
						id={statusId}
						role="status"
						className={status === "error" ? "text-danger text-xs" : "sr-only"}>
						{message}
					</p>
				) : null}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-start gap-4">
				<div className="bg-paper-deep border-line relative size-28 shrink-0 overflow-hidden rounded-md border">
					{preview ? (
						<Image
							src={preview}
							alt=""
							fill
							sizes="112px"
							className="object-cover"
						/>
					) : (
						<span className="text-cocoa-soft grid h-full place-content-center text-xs">
							No photo
						</span>
					)}
				</div>

				<div className="flex flex-col gap-2">
					{fileInput}

					<button
						type="button"
						disabled={status === "working"}
						onClick={() => inputRef.current?.click()}
						className="border-line hover:border-cocoa hover:bg-paper-deep rounded-pill min-h-11 w-fit border px-5 text-sm font-medium transition-colors disabled:opacity-50">
						{status === "working" ? "Uploading…" : preview ? "Replace photo" : "Choose a photo"}
					</button>

					{preview ? (
						<button
							type="button"
							onClick={() => {
								onChange("");
								setMessage(null);
							}}
							className="text-cocoa-soft hover:text-danger w-fit text-xs underline underline-offset-2">
							Remove photo
						</button>
					) : null}

					<p className="text-cocoa-soft max-w-xs text-xs">
						Square or slightly tall photos work best. Big files are fine, they get resized here
						before uploading.
					</p>
				</div>
			</div>

			{message ? (
				<p
					role="status"
					className={status === "error" ? "text-danger text-sm" : "text-cocoa-soft text-sm"}>
					{message}
				</p>
			) : null}
		</div>
	);
}
