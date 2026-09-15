import type { Metadata } from "next";
import Link from "next/link";
import { instagramUrl } from "@/lib/constants";
import { getSettings } from "@/lib/queries";
import { Container, Section } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";

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
const LAST_UPDATED = "15 September 2026";

/**
 * One clause of the policy.
 *
 * Hairlines and a serif heading rather than a wall of legal text: this is the
 * same printed-card language as every other page, because a policy nobody reads
 * is not a policy. The prose is deliberately plain for the same reason.
 */
function Clause({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="border-line flex flex-col gap-3 border-t pt-8 first:border-t-0 first:pt-0">
			<h2 className="font-display text-2xl">{title}</h2>
			<div className="text-cocoa-soft flex flex-col gap-3">{children}</div>
		</section>
	);
}

/** A bulleted list, since preflight strips the markers and padding from `ul`. */
function Points({ children }: { children: React.ReactNode }) {
	return <ul className="flex list-disc flex-col gap-1.5 pl-5">{children}</ul>;
}

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
							<li>Nothing is sold, rented, or used to advertise to you anywhere.</li>
						</Points>
					</Clause>

					<Clause title="What you give me when you order">
						<p>The order form asks for:</p>
						<Points>
							<li>your name, so I know whose box it is;</li>
							<li>your email address, which is where the confirmation and the order link go;</li>
							<li>your phone number, for the day itself if something changes;</li>
							<li>a delivery address, only if you choose delivery;</li>
							<li>
								anything you type into the notes or the custom request — allergies, an occasion, how
								you want it to look;
							</li>
							<li>any inspiration photos or link you attach;</li>
							<li>what you ordered, and the date you picked.</li>
						</Points>
						<p>
							Only the first three are required. The rest is there because it is useful to you, so
							leave out whatever you would rather not send.
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
								<strong className="text-cocoa font-medium">Supabase</strong> stores the orders and
								any photos you attach.
							</li>
							<li>
								<strong className="text-cocoa font-medium">Vercel</strong> hosts the site and runs
								the code that takes the order.
							</li>
							<li>
								<strong className="text-cocoa font-medium">Resend</strong> delivers the emails, and
								tells me if one bounced or was marked as spam.
							</li>
						</Points>
						<p>
							Their servers sit outside New Zealand, so that is where your details are stored.
							Nobody else is given them, and they are never sold or handed to advertisers.
						</p>
					</Clause>

					<Clause title="The link to your order">
						<p>
							The link in your confirmation email is the key to that order — anyone holding it can
							see the order, so it is worth keeping to yourself. It is not listed on the site, and
							search engines are told to stay out of it. If you would rather it stopped working, say
							so and I will cancel it.
						</p>
					</Clause>

					<Clause title="How long I keep it">
						<p>
							Order records are kept for seven years, which is how long New Zealand tax law asks a
							business to hold its sales records. Inspiration photos and the notes on an order are
							not part of that, so I will delete those sooner if you ask.
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
