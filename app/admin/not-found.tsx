import { Wordmark } from "@/components/site/SiteHeader";
import { ButtonLink } from "@/components/ui/Button";

/**
 * The admin's own 404, so a mistyped order or product id lands somewhere useful
 * instead of on the customer-facing 404 with its shop header and "see the menu"
 * button. Deliberately plain, like the rest of the admin.
 *
 * It sits at app/admin rather than inside the (dashboard) group so it also
 * covers the login route, and so it renders without `requireAdmin()` — a signed
 * out owner following a stale bookmark should see this, not an auth error.
 */
export default function AdminNotFound() {
	return (
		<div className="bg-paper grid min-h-screen place-content-center gap-5 px-6 text-center">
			<Wordmark
				size="sm"
				className="mx-auto"
			/>
			<p className="text-2xs text-cocoa-soft font-medium tracking-widest uppercase">Error 404</p>
			<h1 className="font-display text-2xl">No such page in the admin</h1>
			<p className="text-cocoa-soft mx-auto max-w-sm text-sm">
				The order or product this link points at has been deleted, or the address is wrong.
			</p>
			<ButtonLink
				href="/admin"
				variant="secondary"
				className="mx-auto">
				Back to Today
			</ButtonLink>
		</div>
	);
}
