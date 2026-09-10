import { Container } from "@/components/ui/Container";

/**
 * Shown whenever the site is serving the built-in stand-in catalogue because no
 * Supabase project is configured. Deliberately impossible to miss: nobody should
 * ever mistake demo prices for real ones.
 */
export function DemoBanner() {
	return (
		<div className="bg-cocoa text-paper">
			<Container
				width="wide"
				className="py-2.5">
				<p className="text-xs">
					<strong className="font-medium">Demo data.</strong> No database is connected, so these
					products and dates are placeholders. Set{" "}
					<code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> in{" "}
					<code className="font-mono">.env.local</code> to use real data.
				</p>
			</Container>
		</div>
	);
}
