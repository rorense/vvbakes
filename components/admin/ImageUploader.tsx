"use client";

import imageCompression from "browser-image-compression";
import Image from "next/image";
import { useRef, useState } from "react";
import { productImagePath, productImageUrl } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";
import { PRODUCT_IMAGE_BUCKET } from "@/lib/constants";

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
 */
export function ImageUploader({
	slug,
	value,
	onChange,
}: {
	slug: string;
	value: string;
	onChange: (path: string) => void;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
	const [message, setMessage] = useState<string | null>(null);

	const preview = productImageUrl(value);

	async function handleFile(file: File) {
		setStatus("working");
		setMessage(null);

		try {
			const compressed = await imageCompression(file, {
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
