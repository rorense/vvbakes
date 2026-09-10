import Link from "next/link";
import { instagramUrl } from "@/lib/constants";
import type { SiteSettings } from "@/lib/types";
import { Container } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Wordmark } from "./SiteHeader";

export function SiteFooter({ settings }: { settings: SiteSettings }) {
	const year = new Date().getFullYear();

	return (
		<footer className="bg-paper-deep border-line border-t">
			<Container
				width="wide"
				className="flex flex-col gap-10 py-14">
				<div className="grid gap-10 sm:grid-cols-3">
					<div className="flex flex-col gap-3">
						<Wordmark size="lg" />
						<p className="text-cocoa-soft text-sm">{settings.tagline}</p>
					</div>

					<nav
						aria-label="Footer"
						className="flex flex-col gap-3">
						<SectionLabel>Browse</SectionLabel>
						<Link
							href="/shop"
							className="w-fit text-sm hover:underline">
							Shop
						</Link>
						<Link
							href="/order"
							className="w-fit text-sm hover:underline">
							Place an order
						</Link>
						<a
							href={instagramUrl(settings.instagramHandle)}
							target="_blank"
							rel="noopener noreferrer"
							className="w-fit text-sm hover:underline">
							@{settings.instagramHandle}
						</a>
					</nav>

					<div className="flex flex-col gap-3">
						<SectionLabel>Get in touch</SectionLabel>
						{settings.contactEmail ? (
							<a
								href={`mailto:${settings.contactEmail}`}
								className="w-fit text-sm hover:underline">
								{settings.contactEmail}
							</a>
						) : null}
						{settings.contactPhone ? (
							<a
								href={`tel:${settings.contactPhone.replace(/\s/g, "")}`}
								className="w-fit text-sm hover:underline">
								{settings.contactPhone}
							</a>
						) : null}
						{settings.pickupSuburb ? (
							<p className="text-cocoa-soft text-sm">Pickup from {settings.pickupSuburb}</p>
						) : null}
					</div>
				</div>

				<div className="border-line flex flex-col gap-2 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-cocoa-soft text-xs">
						Orders by request. We confirm by email, then you pay by bank transfer.
					</p>
					<p className="text-cocoa-soft text-xs">
						&copy; {year} {settings.businessName}
					</p>
				</div>
			</Container>
		</footer>
	);
}
