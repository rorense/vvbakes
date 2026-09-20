import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { instagramUrl } from "@/lib/constants";
import type { SiteSettings } from "@/lib/types";
import { Container } from "@/components/ui/Container";
import { NavLink } from "@/components/ui/NavLink";
import { MobileNav, type NavItem } from "@/components/site/MobileNav";

/** The lowercase serif wordmark. Text, not an image, so it stays crisp and selectable. */
export function Wordmark({
	className,
	size = "md",
}: {
	className?: string;
	size?: "sm" | "md" | "lg";
}) {
	const sizes = {
		sm: "text-xl",
		md: "text-2xl",
		lg: "text-4xl",
	} as const;

	return (
		<span
			className={cn("font-display tracking-tightest lowercase", sizes[size], className)}
			style={{ fontVariationSettings: '"SOFT" 40, "WONK" 1' }}>
			vvbakes
		</span>
	);
}

/** The logo and wordmark, sized for a header bar. Rendered by the mobile sheet too. */
function BrandMarks({ priority }: { priority?: boolean }) {
	return (
		<>
			<Image
				src="/logo.png"
				alt=""
				aria-hidden="true"
				width={800}
				height={800}
				className="size-8 shrink-0 sm:size-10"
				priority={priority}
			/>
			<Wordmark
				size="sm"
				className="truncate font-bold sm:text-2xl"
			/>
		</>
	);
}

/**
 * One list for both navigations. The header lays these out as pills from 40rem
 * up; below that they are the contents of the hamburger sheet, which is why
 * none of them carries a breakpoint of its own any more.
 */
const LINKS: NavItem[] = [
	{ href: "/shop", label: "Shop" },
	{ href: "/order", label: "Order cart" },
	// "When can I get a cake" is the question people actually arrive with, and
	// the pickup details sit directly under the calendar anyway.
	{ href: "/#dates", label: "Availability" },
];

export function SiteHeader({ settings }: { settings: SiteSettings }) {
	return (
		<header className="bg-paper border-line sticky top-0 z-30 border-b backdrop-blur-sm">
			<Container
				width="wide"
				className="flex h-16 items-center justify-between gap-4 sm:h-20">
				<Link
					href="/"
					className="flex min-w-0 shrink items-center gap-2 sm:gap-2.5"
					aria-label={`${settings.businessName} home`}>
					<BrandMarks priority />
				</Link>

				<nav
					aria-label="Main"
					className="hidden shrink-0 items-center gap-2 sm:flex">
					{/* Order is the slow one, it is `force-dynamic` and reads the whole
					    booking picture before it can draw, so these say when they've
					    been tapped rather than leaving the header looking untouched. */}
					{LINKS.map((link) => (
						<NavLink
							key={link.href}
							href={link.href}
							className="tap-safe hover:bg-paper-deep rounded-pill px-4 py-2 text-sm font-medium transition-colors">
							{link.label}
						</NavLink>
					))}
					<a
						href={instagramUrl(settings.instagramHandle)}
						target="_blank"
						rel="noopener noreferrer"
						className="hover:bg-paper-deep rounded-pill px-4 py-2 text-sm font-medium transition-colors">
						@{settings.instagramHandle}
					</a>
				</nav>

				{/* The sheet covers the header it opens from, so it carries its own
				    copy of the logo and wordmark to put back what it hid. Not a link:
				    a second "home" inside the menu that does nothing when you are
				    already home would leave the sheet sitting there. */}
				<MobileNav
					links={LINKS}
					instagramHandle={settings.instagramHandle}
					instagramHref={instagramUrl(settings.instagramHandle)}
					brand={<BrandMarks />}
				/>
			</Container>
		</header>
	);
}
