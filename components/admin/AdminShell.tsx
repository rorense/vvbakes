import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * The admin is used mostly on a phone, standing in a kitchen, so it is laid out
 * phone-first: a title bar at the top, a fixed tab bar at the bottom with real
 * 44px targets, and no marketing flourishes anywhere. It shares the site's
 * colours but only the sans face.
 */

const TABS = [
	{ href: "/admin", label: "Today", match: (p: string) => p === "/admin" },
	{ href: "/admin/orders", label: "Orders", match: (p: string) => p.startsWith("/admin/orders") },
	{
		href: "/admin/products",
		label: "Products",
		match: (p: string) => p.startsWith("/admin/products") || p.startsWith("/admin/categories"),
	},
	{
		href: "/admin/availability",
		label: "Calendar",
		match: (p: string) => p.startsWith("/admin/availability"),
	},
	{
		href: "/admin/settings",
		label: "Settings",
		match: (p: string) => p.startsWith("/admin/settings"),
	},
];

export function AdminShell({
	pathname,
	children,
}: {
	pathname: string;
	children: React.ReactNode;
}) {
	return (
		<div className="bg-paper min-h-screen">
			<div className="mx-auto w-full max-w-4xl px-4 pt-4 pb-28 sm:px-6 sm:pb-10">{children}</div>

			<nav
				aria-label="Admin sections"
				className="border-line bg-paper fixed inset-x-0 bottom-0 z-40 border-t sm:static sm:border-t-0">
				<ul className="mx-auto flex w-full max-w-4xl px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:hidden">
					{TABS.map((tab) => {
						const active = tab.match(pathname);
						return (
							<li
								key={tab.href}
								className="flex-1">
								<Link
									href={tab.href}
									aria-current={active ? "page" : undefined}
									className={cn(
										"text-2xs flex min-h-11 flex-col items-center justify-center rounded-md px-1 py-2 font-medium",
										active ? "bg-paper-deep text-cocoa" : "text-cocoa-soft",
									)}>
									{tab.label}
								</Link>
							</li>
						);
					})}
				</ul>
			</nav>
		</div>
	);
}

/** Desktop gets the same sections as a plain row above the page. */
export function AdminNav({ pathname }: { pathname: string }) {
	return (
		<nav
			aria-label="Admin sections"
			className="hidden gap-1 sm:flex">
			{TABS.map((tab) => {
				const active = tab.match(pathname);
				return (
					<Link
						key={tab.href}
						href={tab.href}
						aria-current={active ? "page" : undefined}
						className={cn(
							"rounded-pill px-4 py-2 text-sm font-medium transition-colors",
							active ? "bg-paper-deep text-cocoa" : "text-cocoa-soft hover:text-cocoa",
						)}>
						{tab.label}
					</Link>
				);
			})}
		</nav>
	);
}

export function AdminHeader({
	title,
	description,
	action,
	back,
}: {
	title: string;
	description?: string;
	action?: React.ReactNode;
	back?: { href: string; label: string };
}) {
	return (
		<header className="mb-6 flex flex-col gap-3">
			{back ? (
				<Link
					href={back.href}
					className="text-cocoa-soft hover:text-cocoa w-fit text-sm underline underline-offset-4">
					&larr; {back.label}
				</Link>
			) : null}
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h1 className="font-display text-2xl">{title}</h1>
					{description ? <p className="text-cocoa-soft text-sm">{description}</p> : null}
				</div>
				{action}
			</div>
		</header>
	);
}

export function AdminCard({
	title,
	children,
	className,
}: {
	title?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("border-line rounded-lg border p-4 sm:p-6", className)}>
			{title ? <h2 className="font-display mb-4 text-lg">{title}</h2> : null}
			{children}
		</section>
	);
}

/**
 * The up/down pair that moves a row in a hand-ordered list.
 *
 * Presentational on purpose: the row owns the transition, because it also dims
 * itself while the move is in flight.
 */
export function ReorderButtons({
	label,
	layout = "column",
	disabled,
	isFirst,
	isLast,
	onMove,
}: {
	/** Named in the accessible label, e.g. "Move Cupcakes up". */
	label: string;
	/** The product list has room to stack them; the category row does not. */
	layout?: "column" | "row";
	disabled?: boolean;
	isFirst: boolean;
	isLast: boolean;
	onMove: (direction: "up" | "down") => void;
}) {
	const button =
		"border-line hover:border-cocoa tap-safe grid size-8 place-content-center rounded-md border text-sm disabled:opacity-30";

	return (
		<div
			className={cn(
				"flex shrink-0",
				layout === "column" ? "flex-col items-end gap-1" : "items-center gap-1.5",
			)}>
			<button
				type="button"
				disabled={disabled || isFirst}
				onClick={() => onMove("up")}
				className={button}
				aria-label={`Move ${label} up`}>
				<span aria-hidden="true">↑</span>
			</button>
			<button
				type="button"
				disabled={disabled || isLast}
				onClick={() => onMove("down")}
				className={button}
				aria-label={`Move ${label} down`}>
				<span aria-hidden="true">↓</span>
			</button>
		</div>
	);
}

export function EmptyState({ children }: { children: React.ReactNode }) {
	return (
		<p className="border-line text-cocoa-soft rounded-lg border border-dashed px-4 py-8 text-center text-sm">
			{children}
		</p>
	);
}
