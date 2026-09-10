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
	// "idle" until someone presses it; "unsupported" if the browser refuses,
	// which is common in a non-secure context. Gating the button's existence on
	// a capability check would mean rendering it after mount, and a control that
	// appears a moment late is worse than one that says it could not help.
	const [copied, setCopied] = useState<"idle" | "copied" | "unsupported">("idle");

	useEffect(() => {
		if (copied === "idle") return;
		const timer = setTimeout(() => setCopied("idle"), 2500);
		return () => clearTimeout(timer);
	}, [copied]);

	return (
		<span className="inline-flex items-center gap-2">
			<span className="text-sm font-medium select-all">{value}</span>
			<button
				type="button"
				className="border-line hover:border-cocoa hover:bg-paper-deep rounded-pill text-2xs border px-2.5 py-1 transition-colors"
				onClick={async () => {
					try {
						await navigator.clipboard.writeText(value);
						setCopied("copied");
					} catch {
						setCopied("unsupported");
					}
				}}>
				{copied === "copied"
					? "Copied"
					: copied === "unsupported"
						? "Select it instead"
						: `Copy${label ? ` ${label}` : ""}`}
			</button>
			<span
				aria-live="polite"
				className="sr-only">
				{copied === "copied"
					? `${label ?? "Value"} copied`
					: copied === "unsupported"
						? "Copying isn't available here. Select the text to copy it."
						: ""}
			</span>
		</span>
	);
}
