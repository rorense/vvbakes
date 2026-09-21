import Link from "next/link";
import { instagramUrl } from "@/lib/constants";
import { localityLine } from "@/lib/seo";
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
						{/* Set in the logo itself, so it is set here too: same family as the
						    wordmark above was not enough, because Fraunces only looks like the
						    logo with SOFT and WONK dialled in, and those are applied per use.
						    Without them this sat in the plain cut and read as a caption in a
						    different face. */}
						<p
							className="font-display text-cocoa-soft text-sm"
							style={{ fontVariationSettings: '"SOFT" 40, "WONK" 1' }}>
							{settings.tagline}
						</p>
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
						{/* Always printed now, and through `localityLine`, so it reads
						    "Pickup from Mt Roskill, Auckland". The city belongs in the
						    footer of every page for the same reason a real shop puts its
						    address there: it is the one line that says where this is. */}
						<p className="text-cocoa-soft text-sm">
							Pickup from {localityLine(settings.pickupSuburb)}
						</p>
					</div>
				</div>

				<div className="border-line flex flex-col gap-2 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-cocoa-soft text-xs">
						Custom cakes and small-batch bakes, made fresh for you.
					</p>
					<div className="text-cocoa-soft flex items-center gap-4 text-xs">
						<Link
							href="/terms"
							className="hover:underline">
							Terms
						</Link>
						<Link
							href="/privacy"
							className="hover:underline">
							Privacy
						</Link>
						<p>
							&copy; {year} {settings.businessName}
						</p>
					</div>
				</div>
			</Container>
		</footer>
	);
}
