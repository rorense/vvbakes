import Link from "next/link";
import { headers } from "next/headers";
import { signOut } from "@/app/admin/(auth)/login/actions";
import { requireAdmin } from "@/lib/auth";
import { AdminNav, AdminShell } from "@/components/admin/AdminShell";
import { Wordmark } from "@/components/site/SiteHeader";

export const dynamic = "force-dynamic";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
	// The real gate. The proxy also redirects, but a layout check means the
	// pages below cannot render for a signed-in non-owner even if middleware is
	// bypassed or misconfigured.
	const user = await requireAdmin();

	// Next exposes the matched path on this header, which is enough to highlight
	// the current tab without turning the whole shell into a client component.
	const pathname = (await headers()).get("x-current-path") ?? "/admin";

	return (
		<AdminShell pathname={pathname}>
			<header className="border-line mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
				<Link
					href="/admin"
					className="flex items-center gap-2">
					<Wordmark size="sm" />
					<span className="text-cocoa-soft text-xs">admin</span>
				</Link>

				<AdminNav pathname={pathname} />

				<div className="flex items-center gap-3">
					<Link
						href="/"
						className="text-cocoa-soft hover:text-cocoa text-xs underline underline-offset-4">
						View site
					</Link>
					<form action={signOut}>
						<button
							type="submit"
							className="text-cocoa-soft hover:text-cocoa text-xs underline underline-offset-4">
							Sign out
						</button>
					</form>
					<span className="text-cocoa-soft hidden text-xs sm:inline">{user.email}</span>
				</div>
			</header>

			{children}
		</AdminShell>
	);
}
