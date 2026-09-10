/**
 * Keyboard users land here first and can jump the header. Visually hidden until
 * focused, then it appears as a normal button in the top-left.
 */
export function SkipLink({ href = "#main" }: { href?: string }) {
	return (
		<a
			href={href}
			className="focus-visible:rounded-pill focus-visible:bg-cocoa focus-visible:text-paper sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50 focus-visible:px-5 focus-visible:py-3 focus-visible:text-sm">
			Skip to content
		</a>
	);
}
