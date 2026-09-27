import type { ReactNode } from "react";

/**
 * Small print behind a tap, so a long product page reads as a few questions
 * rather than a wall of paragraphs. A native <details>: works without
 * JavaScript, opens on tap on a phone, and is announced as expandable.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
	return (
		<details className="group text-xs">
			<summary className="text-cocoa-soft hover:text-cocoa inline-flex min-h-6 cursor-pointer list-none items-center gap-1.5 underline underline-offset-2 [&::-webkit-details-marker]:hidden">
				<span
					aria-hidden
					className="grid size-4 place-items-center rounded-full border border-current text-[10px] leading-none font-semibold no-underline">
					{/* Question mark while closed, a cross once open, so it reads as the way back. */}
					<span className="group-open:hidden">?</span>
					<span className="hidden group-open:inline">×</span>
				</span>
				{label}
			</summary>
			<div className="text-cocoa-soft bg-paper-deep mt-2 flex flex-col gap-2 rounded-md p-3">
				{children}
			</div>
		</details>
	);
}
