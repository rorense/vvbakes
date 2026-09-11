import Image from "next/image";
import Link from "next/link";
import { buildPublicCalendar, computeAvailability } from "@/lib/availability";
import { formatDateShort } from "@/lib/dates";
import { instagramUrl, siteUrl } from "@/lib/constants";
import {
	getAvailabilityInputs,
	getCategories,
	getFeaturedProducts,
	getSettings,
} from "@/lib/queries";
import { ButtonLink } from "@/components/ui/Button";
import { Container, Section } from "@/components/ui/Container";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { Marquee } from "@/components/ui/Marquee";
import { ArchFrame } from "@/components/ui/ArchFrame";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Sticker } from "@/components/ui/Sticker";
import { ProductCard, ProductImage } from "@/components/site/ProductCard";
import { PublicCalendar } from "@/components/site/PublicCalendar";

// Revalidated on a timer and on demand whenever the admin changes the catalogue.
export const revalidate = 300;

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
		body: "Or what to avoid. Allergies especially — tell me early, not on the day.",
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
	const [{ settings, products, rules, overrides, counts }, featured, categories] =
		await Promise.all([getAvailabilityInputs(), getFeaturedProducts(), getCategories()]);

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
			    headline holds the left, one photo holds the right, and a single
			    tilted sticker overlaps the two. */}
			<Section
				tone="paper"
				size="loose"
				className="relative overflow-hidden">
				<div
					className="dot-field pointer-events-none absolute inset-0"
					aria-hidden="true"
				/>
				<Container
					width="wide"
					className="relative">
					<div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
						<div className="flex flex-col gap-6 lg:col-span-7">
							<SectionLabel>
								{settings.pickupSuburb
									? `Custom cakes, made in ${settings.pickupSuburb}`
									: "Custom cakes, made to order"}
							</SectionLabel>

							<h1
								className="text-5xl"
								style={{ fontVariationSettings: '"SOFT" 40, "WONK" 1' }}>
								Tell me what you&rsquo;re celebrating. I&rsquo;ll bake it.
							</h1>

							<p className="text-cocoa-soft max-w-lg text-lg">
								Cakes made for one occasion and one day &mdash; your flavours, your colours,
								whatever it needs to say on top. Or take something ready-made off the menu and
								I&rsquo;ll box it up.
							</p>

							<div className="mt-2 flex flex-wrap gap-3">
								<ButtonLink
									href="/order"
									size="lg">
									{nextDate ? `Start a cake for ${formatDateShort(nextDate.date)}` : "Start a cake"}
								</ButtonLink>
								<ButtonLink
									href="/shop"
									variant="secondary"
									size="lg">
									See the menu
								</ButtonLink>
							</div>
						</div>

						<div className="relative lg:col-span-5">
							<ArchFrame
								tone="blush"
								className="aspect-4/5 w-full">
								{featured[0] ? (
									<ProductImage
										product={featured[0]}
										sizes="(min-width: 1024px) 40vw, 100vw"
										priority
									/>
								) : (
									<div className="grid h-full place-content-center">
										<Image
											src="/logo.png"
											alt=""
											aria-hidden="true"
											width={800}
											height={800}
											className="w-40 opacity-70"
										/>
									</div>
								)}
							</ArchFrame>

							<div className="absolute -bottom-6 -left-4 sm:-left-8">
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

			{/* Custom cakes. This is the actual business — the menu below is the
			    easy half — so it gets a section of its own rather than a line in
			    the hero and a textarea at the end of the order form. */}
			<Section tone="blush">
				<Container width="wide">
					<div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
						<div className="flex flex-col gap-4 lg:col-span-5">
							<SectionLabel>Custom cakes</SectionLabel>
							<h2 className="font-display text-3xl">The one in your head</h2>
							<p className="text-cocoa-soft">
								Birthdays, engagements, the cake someone has been hinting about for a month. Tell me
								what it&rsquo;s for and I&rsquo;ll tell you what&rsquo;s possible, what it costs,
								and whether I can fit it in.
							</p>
							<p className="text-cocoa-soft">
								No idea where to start? That&rsquo;s fine. &ldquo;Chocolate, for eight, not too
								sweet&rdquo; is plenty to go on.
							</p>
							<div className="mt-2">
								<ButtonLink href="/order#custom">Ask about a cake</ButtonLink>
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

			{/* The baker's note and the practical pickup details, side by side. */}
			<Section
				tone="paper"
				id="pickup">
				<Container width="wide">
					<div className="grid gap-12 sm:grid-cols-2 sm:gap-16">
						{settings.aboutText ? (
							<div className="flex flex-col gap-4">
								<SectionLabel as="h2">A note from the baker</SectionLabel>
								<p className="font-display text-xl leading-relaxed">{settings.aboutText}</p>
								<a
									href={instagramUrl(settings.instagramHandle)}
									target="_blank"
									rel="noopener noreferrer"
									className="w-fit text-sm font-medium underline underline-offset-4">
									Follow @{settings.instagramHandle}
								</a>
							</div>
						) : null}

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
					</div>
				</Container>
			</Section>

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
