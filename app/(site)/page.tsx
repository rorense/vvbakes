import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { buildPublicCalendar, computeAvailability } from "@/lib/availability";
import { formatDateShort } from "@/lib/dates";
import { instagramUrl, siteUrl } from "@/lib/constants";
import {
	getAvailabilityInputs,
	getCategories,
	getFaqs,
	getFeaturedProducts,
	getReviews,
	getSettings,
} from "@/lib/queries";
import { ButtonLink } from "@/components/ui/Button";
import { Container, Section } from "@/components/ui/Container";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { Marquee } from "@/components/ui/Marquee";
import { ArchFrame } from "@/components/ui/ArchFrame";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Sticker } from "@/components/ui/Sticker";
import { ProductCard } from "@/components/site/ProductCard";
import { PublicCalendar } from "@/components/site/PublicCalendar";

/**
 * Revalidated on demand: every admin mutation ends in `revalidateCatalogue()`,
 * which purges this page, so an edit is live on the very next request rather
 * than whenever a timer happens to come round.
 *
 * The timer is only the backstop for a change that never went through the admin
 * — a row edited straight in Supabase — and it is deliberately long, which is
 * the opposite of the obvious move. An expired window does not make the next
 * visitor wait for a fresh render; it hands them the stale page and regenerates
 * behind them. So the window is not how quickly an edit shows, it is how often
 * someone eats a stale load, and at 300 that was every five minutes for nothing.
 */
export const revalidate = 3600;

/**
 * The home page inherits its title and description from the root layout, but a
 * canonical has to be declared per page: `alternates` is inherited wholesale in
 * Next, so a single one on the layout would make every page claim to be "/".
 */
export const metadata: Metadata = {
	alternates: { canonical: "/" },
};

/** What to mention when asking about a custom cake. */
const CUSTOM_PROMPTS = [
	{
		label: "The occasion",
		body: "Birthday, wedding, Tuesday. It changes what I'd suggest more than you'd think.",
	},
	{
		label: "How many people",
		body: "Roughly is fine. I'd rather you had leftovers than ran out.",
	},
	{
		label: "Flavours",
		body: "Or what to avoid. Allergies especially. Tell me early, not on the day.",
	},
	{
		label: "How it should look",
		body: "Colours, writing on top, a photo you've saved. Screenshots are genuinely useful.",
	},
	{
		label: "When you need it",
		body: "Pick a date from the calendar below. The further ahead, the more I can do.",
	},
];

const STEPS = [
	{
		n: "01",
		title: "Tell me about it",
		body: "What you're celebrating, roughly how many people, and any flavour or colour you're set on. Send a photo if you've seen something you like.",
	},
	{
		n: "02",
		title: "Pick a day",
		body: "Only the days I'm actually baking turn up, so nothing gets promised twice.",
	},
	{
		n: "03",
		title: "I'll come back to you",
		body: "An email with the price, where to send it and a reference. Nothing to pay before that.",
	},
];

export default async function HomePage() {
	const [{ settings, products, rules, overrides, counts }, featured, categories, faqs, reviews] =
		await Promise.all([
			getAvailabilityInputs(),
			getFeaturedProducts(),
			getCategories(),
			getFaqs(),
			getReviews(),
		]);

	const availability = computeAvailability({
		settings,
		rules,
		overrides,
		counts,
	});
	const nextDate = availability.dates[0] ?? null;
	const calendarMonths = buildPublicCalendar({ settings, rules, overrides, counts });

	const marqueeItems = products.length > 0 ? products.map((p) => p.name) : [settings.tagline];

	return (
		<>
			{/* Hero. A 12-column editorial split rather than a centred banner: the
			    headline holds the left, the logo holds the right, and a single
			    tilted sticker overlaps the two. */}
			<Section
				tone="paper"
				className="relative overflow-hidden">
				<div
					className="heart-field text-peach pointer-events-none absolute inset-0 opacity-35"
					aria-hidden="true"
				/>
				<Container
					width="wide"
					className="relative">
					<div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
						<div className="flex flex-col gap-6 lg:col-span-7">
							<SectionLabel>
								{settings.pickupSuburb
									? `Sweet treats, made in ${settings.pickupSuburb}`
									: "Sweet treats, made to order"}
							</SectionLabel>

							{/* text-5xl clamps on viewport *width* and tops out at 88px, which on a
							    wide but short laptop pushes the buttons under the fold. Cap it on
							    height as well, with a floor so a landscape phone doesn't shrink the
							    headline to nothing. */}
							<h1
								style={{
									fontVariationSettings: '"SOFT" 40, "WONK" 1',
									fontSize: "min(var(--text-5xl), max(2.5rem, 8vh))",
									lineHeight: 1,
								}}>
								Homemade bakes for every occasion.
							</h1>

							<p className="text-cocoa-soft max-w-lg text-lg">
								Cakes, cookies &amp; sweet treats for celebrations, gatherings and everything in
								between.
							</p>

							{/* Her own voice, moved up out of the pickup band at the client's ask. It is
							    what makes a home kitchen worth trusting, and almost nobody scrolled far
							    enough to find it. Set in the display face against a rose rule so it reads
							    as an aside rather than a second tagline. */}
							{settings.aboutText ? (
								<div className="border-rose flex max-w-lg flex-col gap-2 border-l-2 pl-5">
									<SectionLabel as="h2">A note from the baker</SectionLabel>
									<p className="font-display text-base leading-relaxed sm:text-lg">
										{settings.aboutText}
									</p>
									<a
										href={instagramUrl(settings.instagramHandle)}
										target="_blank"
										rel="noopener noreferrer"
										className="w-fit text-sm font-medium underline underline-offset-4">
										Follow @{settings.instagramHandle}
									</a>
								</div>
							) : null}

							<div className="mt-2 flex flex-wrap gap-3">
								<ButtonLink
									href="/order"
									size="lg">
									{nextDate
										? `Start an order for ${formatDateShort(nextDate.date)}`
										: "Start an order"}
								</ButtonLink>
								<ButtonLink
									href="/shop"
									variant="secondary"
									size="lg">
									See the menu
								</ButtonLink>
							</div>
						</div>

						{/* Capped until `lg`, where the grid finally gives the badge a column of
						    its own. Uncapped it is `w-full` of the whole container on a phone,
						    which made a 419px-tall arch the page's main event and pushed the
						    buttons off the fold. The cap sits on this wrapper rather than on the
						    frame so the sticker, positioned against it, shrinks with the arch
						    rather than drifting off into the margin. */}
						<div className="relative mx-auto w-full max-w-64 lg:col-span-5 lg:mx-0 lg:max-w-none">
							{/* The badge fills the arch rather than sitting on a tile inside it. It is
							    the ringless crop, and the frame is butter because that is the badge’s
							    own ground — so the corners the circle cannot reach carry on the same
							    yellow. The pink the crop took off comes back as the arch’s own border,
							    in rose, which is the colour the ring was drawn in. */}
							<ArchFrame
								tone="butter"
								className="border-rose aspect-4/5 w-full border-12 lg:border-20">
								<Image
									src="/hero-badge.png"
									alt=""
									aria-hidden="true"
									width={706}
									height={706}
									sizes="(min-width: 1024px) 40vw, 256px"
									className="h-full w-full object-contain"
									priority
								/>
							</ArchFrame>

							<div className="absolute -bottom-6 -left-8">
								<Sticker tone={availability.ordersOpen ? "rose-deep" : "cocoa"}>
									{availability.ordersOpen ? (
										nextDate ? (
											<>
												oven&rsquo;s on
												<br />
												<span className="font-display text-sm">
													next free day {formatDateShort(nextDate.date)}
												</span>
											</>
										) : (
											<>booked solid, sorry</>
										)
									) : (
										<>oven&rsquo;s off for now</>
									)}
								</Sticker>
							</div>
						</div>
					</div>
				</Container>
			</Section>

			{/* A band of names scrolling past, the way a bakery window lists what is
			    in today. */}
			<div className="bg-paper-deep border-line border-y">
				<Marquee items={marqueeItems} />
			</div>

			{!availability.ordersOpen && settings.ordersClosedMessage ? (
				<Section
					tone="rose"
					size="tight">
					<Container width="narrow">
						<p className="text-center text-lg">{settings.ordersClosedMessage}</p>
					</Container>
				</Section>
			) : null}

			{/* Custom cakes. This is the actual business, so it gets a section of
			    its own rather than a line in the hero. It used to lead to a panel
			    at the bottom of the order form; it now leads to the product, where
			    the brief is written beside a photo of the thing. */}
			<Section tone="blush">
				<Container width="wide">
					<div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
						<div className="flex flex-col gap-4 lg:col-span-5">
							<SectionLabel>Custom cakes</SectionLabel>
							<h2 className="font-display text-3xl">A cake made your way</h2>
							<p className="text-cocoa-soft">
								Planning a birthday, celebration or something special? Choose your favourite
								flavour, how many layers you&rsquo;d like, the filling, and the design you have in
								mind, and I&rsquo;ll bring it together into a cake made just for you.
							</p>
							<p className="text-cocoa-soft">
								Not sure exactly what you want? That&rsquo;s okay too. Tell me what you&rsquo;re
								celebrating, your favourite flavours and any ideas you have, and we can work from
								there.
							</p>
							<div className="mt-2">
								<ButtonLink href="/shop/custom-cake">Ask about a cake</ButtonLink>
							</div>
						</div>

						<div className="lg:col-span-7">
							<SectionLabel
								as="h3"
								className="mb-3">
								Helpful to know
							</SectionLabel>
							<HairlineList as="dl">
								{CUSTOM_PROMPTS.map((prompt) => (
									<HairlineRow
										key={prompt.label}
										align="start"
										className="flex-col gap-1 sm:flex-row sm:gap-8">
										<dt className="text-sm font-medium sm:w-40 sm:shrink-0">{prompt.label}</dt>
										<dd className="text-cocoa-soft flex-1 text-sm">{prompt.body}</dd>
									</HairlineRow>
								))}
							</HairlineList>
						</div>
					</div>
				</Container>
			</Section>

			{/* Featured products. */}
			{featured.length > 0 ? (
				<Section tone="paper">
					<Container width="wide">
						<div className="mb-10 flex flex-wrap items-end justify-between gap-4">
							<div className="flex flex-col gap-2">
								<SectionLabel>From the menu</SectionLabel>
								<h2 className="font-display text-3xl">No decisions required</h2>
							</div>
							<Link
								href="/shop"
								className="text-sm font-medium underline underline-offset-4">
								See the whole menu
							</Link>
						</div>

						<div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
							{featured.map((product, index) => (
								<ProductCard
									key={product.id}
									product={product}
									priority={index === 0}
								/>
							))}
						</div>
					</Container>
				</Section>
			) : null}

			{/* Kind words. Between seeing the cakes and being asked to order one,
			    which is where someone decides whether to trust a home kitchen with
			    a birthday. Written in /admin/settings, and nothing is seeded, so a
			    site that has collected none simply does not have this band. */}
			{reviews.length > 0 ? (
				<Section
					tone="butter"
					id="reviews">
					<Container width="wide">
						<div className="mb-10 flex flex-col gap-2">
							<SectionLabel>Kind words</SectionLabel>
							<h2 className="font-display text-3xl">What people said after</h2>
						</div>

						<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
							{reviews.map((review) => (
								<figure
									key={review.id}
									className="border-line bg-paper flex flex-col gap-4 rounded-lg border p-6">
									<blockquote className="font-display text-lg leading-relaxed">
										&ldquo;{review.body}&rdquo;
									</blockquote>
									<figcaption className="text-cocoa-soft mt-auto text-sm">
										{review.author}
										{review.detail ? <span className="block text-xs">{review.detail}</span> : null}
									</figcaption>
								</figure>
							))}
						</div>
					</Container>
				</Section>
			) : null}

			{/* How ordering works: a numbered hairline list, like the printed card. */}
			<Section tone="blush">
				<Container width="narrow">
					<div className="mb-8 flex flex-col gap-2">
						<SectionLabel>How it works</SectionLabel>
						<h2 className="font-display text-3xl">Three steps, none of them hard</h2>
					</div>

					<HairlineList
						as="ol"
						className="border-line">
						{STEPS.map((step) => (
							<HairlineRow
								key={step.n}
								align="start"
								className="flex-col gap-1 sm:flex-row sm:gap-8">
								<span className="font-display text-cocoa-soft w-12 shrink-0 text-lg">{step.n}</span>
								<div className="flex flex-1 flex-col gap-1">
									<h3 className="text-lg">{step.title}</h3>
									<p className="text-cocoa-soft text-sm">{step.body}</p>
								</div>
							</HairlineRow>
						))}
					</HairlineList>

					<div className="mt-8">
						<ButtonLink href="/order">Start an order</ButtonLink>
					</div>
				</Container>
			</Section>

			{/* When she bakes. Without this, the only way to find out is to put
			    something in a basket first, which is a strange thing to ask of
			    someone who just wants to know if Saturday is possible. */}
			<Section
				tone="paper"
				id="dates">
				<Container width="wide">
					<div className="mb-8 flex flex-col gap-2">
						<SectionLabel>Dates</SectionLabel>
						<h2 className="font-display text-3xl">When the oven&rsquo;s free</h2>
						{availability.ordersOpen ? (
							<p className="text-cocoa-soft max-w-xl">
								Everything is baked for the day you collect it, which is lovely for you and means
								there are only so many of me to go round.
							</p>
						) : (
							<p className="text-cocoa-soft max-w-xl">
								{settings.ordersClosedMessage ?? "I've paused new orders for the moment."}
							</p>
						)}
					</div>

					{availability.ordersOpen ? (
						<PublicCalendar
							months={calendarMonths}
							leadTimeDays={settings.leadTimeDays}
						/>
					) : null}
				</Container>
			</Section>

			{/* Pickup. The baker's note used to sit beside this in a two-column row;
			    it opens the page now, so what is left is one column and takes the narrow
			    measure rather than stretching a hairline list across the wide one. */}
			<Section
				tone="paper"
				id="pickup">
				<Container width="narrow">
					<div className="flex flex-col gap-4">
						<SectionLabel as="h2">Pickup</SectionLabel>
						<HairlineList as="dl">
							{settings.pickupSuburb ? (
								<HairlineRow as="div">
									<dt className="text-cocoa-soft text-sm">Where</dt>
									<dd className="text-right text-sm font-medium">{settings.pickupSuburb}</dd>
								</HairlineRow>
							) : null}
							{settings.pickupWindowText ? (
								<HairlineRow as="div">
									<dt className="text-cocoa-soft text-sm">When</dt>
									<dd className="text-right text-sm font-medium">{settings.pickupWindowText}</dd>
								</HairlineRow>
							) : null}
							<HairlineRow as="div">
								<dt className="text-cocoa-soft text-sm">Notice needed</dt>
								<dd className="text-right text-sm font-medium">
									{settings.leadTimeDays === 0
										? "Same day"
										: `${settings.leadTimeDays} day${settings.leadTimeDays === 1 ? "" : "s"}`}
								</dd>
							</HairlineRow>
							{settings.deliveryEnabled ? (
								<HairlineRow as="div">
									<dt className="text-cocoa-soft text-sm">Delivery</dt>
									<dd className="text-right text-sm font-medium">
										{settings.deliveryAreaText ?? "Available"}
									</dd>
								</HairlineRow>
							) : null}
							<HairlineRow as="div">
								<dt className="text-cocoa-soft text-sm">Payment</dt>
								<dd className="text-right text-sm font-medium">Bank transfer once confirmed</dd>
							</HairlineRow>
						</HairlineList>

						{settings.pickupInstructions ? (
							<p className="text-cocoa-soft text-sm">{settings.pickupInstructions}</p>
						) : null}

						{categories.length > 0 ? (
							<p className="text-cocoa-soft mt-2 text-sm">
								We bake {categories.map((c) => c.name.toLowerCase()).join(", ")}.
							</p>
						) : null}
					</div>
				</Container>
			</Section>

			{/* Questions. The last band before the footer, where someone who has read
			    this far is deciding whether to actually send the form. Written in
			    /admin/settings, so an empty list is a decision and the band goes. */}
			{faqs.length > 0 ? (
				<Section
					tone="blush"
					id="faq">
					<Container width="narrow">
						<div className="mb-8 flex flex-col gap-2">
							<SectionLabel>Questions</SectionLabel>
							<h2 className="font-display text-3xl">The ones I get asked most</h2>
						</div>

						<HairlineList as="dl">
							{faqs.map((faq) => (
								<HairlineRow
									key={faq.id}
									as="div"
									align="start"
									className="flex-col gap-2">
									<dt className="text-lg">{faq.question}</dt>
									<dd className="text-cocoa-soft text-sm">{faq.answer}</dd>
								</HairlineRow>
							))}
						</HairlineList>
					</Container>
				</Section>
			) : null}

			<BakeryJsonLd
				settings={settings}
				open={availability.ordersOpen}
			/>
		</>
	);
}

function BakeryJsonLd({
	settings,
	open,
}: {
	settings: Awaited<ReturnType<typeof getSettings>>;
	open: boolean;
}) {
	const data = {
		"@context": "https://schema.org",
		"@type": "Bakery",
		name: settings.businessName,
		description: settings.tagline,
		url: siteUrl(),
		image: `${siteUrl()}/opengraph-image.png`,
		sameAs: [instagramUrl(settings.instagramHandle)],
		...(settings.contactEmail ? { email: settings.contactEmail } : {}),
		...(settings.contactPhone ? { telephone: settings.contactPhone } : {}),
		...(settings.pickupSuburb
			? {
					address: {
						"@type": "PostalAddress",
						addressLocality: settings.pickupSuburb,
						addressCountry: "NZ",
					},
				}
			: {}),
		potentialAction: open
			? {
					"@type": "OrderAction",
					target: `${siteUrl()}/order`,
				}
			: undefined,
	};

	return (
		<script
			type="application/ld+json"
			// Serialised server-side from our own settings, never from user input.
			dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
		/>
	);
}
