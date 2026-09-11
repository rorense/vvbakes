import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { instagramUrl } from "@/lib/constants";
import type { SiteSettings } from "@/lib/types";
import { Container } from "@/components/ui/Container";

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

const LINKS = [
	{ href: "/shop", label: "Shop", small: true },
	{ href: "/order", label: "Order", small: true },
	// Dropped on the narrowest phones, where it pushes the wordmark into the nav.
	{ href: "/#pickup", label: "Pickup", small: false },
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
					<Image
						src="/logo.png"
						alt=""
						aria-hidden="true"
						width={800}
						height={800}
						className="size-8 shrink-0 sm:size-10"
						priority
					/>
					<Wordmark
						size="sm"
						className="truncate sm:text-2xl"
					/>
				</Link>

				<nav
					aria-label="Main"
					className="flex shrink-0 items-center gap-0.5 sm:gap-2">
					{LINKS.map((link) => (
						<Link
							key={link.href}
							href={link.href}
							className={cn(
								"tap-safe hover:bg-paper-deep rounded-pill px-2.5 py-2 text-sm font-medium transition-colors sm:px-4",
								!link.small && "xs:inline-block hidden",
							)}>
							{link.label}
						</Link>
					))}
					<a
						href={instagramUrl(settings.instagramHandle)}
						target="_blank"
						rel="noopener noreferrer"
						className="hover:bg-paper-deep rounded-pill hidden px-4 py-2 text-sm font-medium transition-colors sm:inline-block">
						@{settings.instagramHandle}
					</a>
				</nav>
			</Container>
		</header>
	);
}
