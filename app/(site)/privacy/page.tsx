import type { Metadata } from "next";
import Link from "next/link";
import { instagramUrl } from "@/lib/constants";
import { getSettings } from "@/lib/queries";
import { Container, Section } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Clause, Points, Term } from "@/components/site/Policy";

// Settings supply the business name and the contact address, so this is cached
// on the same timer as the rest of the public site and revalidated by hand when
// the admin saves settings. Same window as the home page, for the reason there.
export const revalidate = 3600;

export const metadata: Metadata = {
	title: "Privacy",
	description:
		"What an order tells me about you, who else it passes through, and how to have it corrected or removed.",
	alternates: { canonical: "/privacy" },
};

/**
 * When the wording below last changed. Bump it whenever a clause changes in a
 * way a customer would care about — not for a typo.
 */
const LAST_UPDATED = "18 September 2026";

export default async function PrivacyPage() {
	const settings = await getSettings();

	// Every clause that offers a way to get in touch goes through this, so a shop
	// with no contact address on file points people at Instagram rather than
	// printing a dead "email me".
	const contact = settings.contactEmail ? (
		<a
			href={`mailto:${settings.contactEmail}`}
			className="text-cocoa underline">
			{settings.contactEmail}
		</a>
	) : (
		<a
			href={instagramUrl(settings.instagramHandle)}
			target="_blank"
			rel="noopener noreferrer"
			className="text-cocoa underline">
			@{settings.instagramHandle}
		</a>
	);

	return (
		<Section
			tone="paper"
			size="tight">
			<Container width="narrow">
				<div className="mb-10 flex flex-col gap-3">
					<SectionLabel>Privacy</SectionLabel>
					<h1 className="font-display text-4xl">What I do with your details</h1>
					<p className="text-cocoa-soft">
						{settings.businessName} is a one-person kitchen, not a company with a marketing
						department. Your details are here so a cake reaches you on the right day, and for
						nothing else.
					</p>
				</div>

				<div className="flex flex-col gap-8">
					<Clause title="The short version">
						<Points>
							<li>An order needs a name, an email address and a phone number.</li>
							<li>There are no accounts and no passwords, so there is nothing to sign up for.</li>
							<li>Card details are never asked for, because payment is by bank transfer.</li>
						</Points>
					</Clause>

					<Clause title="What you give me when you order">
						<p>The order form asks for a few details to help me get everything just right:</p>
						<Points>
							<li>
								<Term>Your name</Term> — so I know who your order is for.
							</li>
							<li>
								<Term>Your email address</Term> — this is where I&rsquo;ll send your order
								confirmation and any updates.
							</li>
							<li>
								<Term>Your phone number</Term> — just in case I need to reach you on the day.
							</li>
							<li>
								<Term>Your delivery address</Term> — only if you choose delivery.
							</li>
							<li>
								<Term>Your notes or custom request</Term> — tell me anything that will help, such as
								allergies, the occasion, or how you&rsquo;d like your bake to look.
							</li>
							<li>
								<Term>Inspiration photos or links</Term> — always welcome if you have something in
								mind.
							</li>
							<li>
								<Term>Your order and preferred date</Term> — so I know exactly what you&rsquo;d like
								and when you need it.
							</li>
						</Points>
						<p>
							Only your name, email address and phone number are required. Everything else is there
							to help me make your order just the way you&rsquo;d like it, so only share what feels
							useful.
						</p>
					</Clause>

					<Clause title="What the site records on its own">
						<p>
							When an order is submitted the server keeps a scrambled, one-way fingerprint of the
							internet address it came from. It is there to notice one machine firing off a dozen
							orders in a minute, and it cannot be turned back into an address or matched to you.
						</p>
						<p>
							Your basket is not sent anywhere until you press the button. Until then it sits in
							your own browser&rsquo;s storage, on your own device, and clearing your browsing data
							clears it.
						</p>
					</Clause>

					<Clause title="Payment">
						<p>
							No card numbers, ever. Once I have confirmed the day and the price I send bank
							details, and the transfer happens in your own banking app. The only part of it this
							site sees is the reference on your order.
						</p>
					</Clause>

					<Clause title="Visitor numbers">
						<p>
							I use Vercel&rsquo;s Web Analytics and Speed Insights to see how many people visited,
							which pages they looked at, and how slow the site felt on a phone. Both are
							cookie-free: nothing is stored on your device, you are not followed from site to site,
							and no profile of you is built.
						</p>
						<p>
							The private link to an order&rsquo;s status page is stripped out before either one is
							told about the visit, so it never leaves your browser.
						</p>
					</Clause>

					<Clause title="Cookies">
						<p>
							This site sets no cookies on a customer&rsquo;s browser. The only one it sets anywhere
							is the login session for the back office, which is mine. That is why there is no
							consent banner in your way — there is nothing to consent to.
						</p>
					</Clause>

					<Clause title="Who else your details pass through">
						<p>Three services keep the shop running, and each handles only what it needs to:</p>
						<Points>
							<li>
								<Term>Supabase</Term> stores the orders and any photos you attach.
							</li>
							<li>
								<Term>Vercel</Term> hosts the site and runs the code that takes the order.
							</li>
							<li>
								<Term>Resend</Term> delivers the emails, and tells me if one bounced or was marked
								as spam.
							</li>
						</Points>
						<p>
							Their servers sit outside New Zealand, so that is where your details are stored.
							Nobody else is given them, and they are never sold or handed to advertisers.
						</p>
					</Clause>

					<Clause title="The link to your order">
						<p>
							Your confirmation email includes a private link to your order, which makes it easy to
							come back and check your order details. Because anyone with the link can view the
							order, please keep it somewhere safe and avoid sharing it.
						</p>
						<p>
							The link isn&rsquo;t listed publicly on the website, and search engines are asked not
							to include it in their results.
						</p>
					</Clause>

					<Clause title="How long I keep it">
						<p>
							I keep basic order records for seven years, as required for business and tax
							record-keeping in New Zealand.
						</p>
						<p>
							Your inspiration photos and personal notes are treated separately and aren&rsquo;t
							kept as part of those long-term sales records.
						</p>
					</Clause>

					<Clause title="Seeing, correcting or deleting what I hold">
						<p>
							Email {contact} and you can ask what I hold about you, ask me to fix anything
							that&rsquo;s wrong, or ask me to delete what I am not required to keep. The Privacy
							Act 2020 gives you a right to the first two, and I will come back to you within 20
							working days.
						</p>
						<p>
							If you are unhappy with how I handled it, you can complain to the Office of the
							Privacy Commissioner at{" "}
							<a
								href="https://www.privacy.org.nz"
								target="_blank"
								rel="noopener noreferrer"
								className="text-cocoa underline">
								privacy.org.nz
							</a>
							.
						</p>
					</Clause>

					<Clause title="If this page changes">
						<p>
							Anything that changes is posted here with a new date. Last updated {LAST_UPDATED}.
						</p>
						<p>
							Anything here you want explained, just ask — {contact}, or{" "}
							<Link
								href="/order"
								className="text-cocoa underline">
								the order form
							</Link>{" "}
							if it is about an order you are placing.
						</p>
					</Clause>
				</div>
			</Container>
		</Section>
	);
}
