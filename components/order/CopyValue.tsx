"use client";

import { useEffect, useState } from "react";

/**
 * A value with a copy button, for bank account numbers and payment references.
 * Typing a 16-digit account number off a phone screen is exactly where people
 * make mistakes, and a mistyped reference means an unmatched payment.
 *
 * The clipboard API needs a secure context and can be refused, so the value is
 * always selectable text as well.
 */
export function CopyValue({ value, label }: { value: string; label?: string }) {
	const [copied, setCopied] = useState(false);
	const [canCopy, setCanCopy] = useState(false);

	useEffect(() => {
		setCanCopy(typeof navigator !== "undefined" && Boolean(navigator.clipboard));
	}, []);

	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 2000);
		return () => clearTimeout(timer);
	}, [copied]);

	return (
		<span className="inline-flex items-center gap-2">
			<span className="text-sm font-medium select-all">{value}</span>
			{canCopy ? (
				<button
					type="button"
					className="border-line hover:border-cocoa hover:bg-paper-deep rounded-pill text-2xs border px-2.5 py-1 transition-colors"
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(value);
							setCopied(true);
						} catch {
							// Refused or unavailable; the text is selectable anyway.
						}
					}}>
					{copied ? "Copied" : `Copy${label ? ` ${label}` : ""}`}
				</button>
			) : null}
			<span
				aria-live="polite"
				className="sr-only">
				{copied ? `${label ?? "Value"} copied` : ""}
			</span>
		</span>
	);
}
