import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { buildPublicCalendar, computeAvailability } from "@/lib/availability";
import { instagramUrl } from "@/lib/constants";
import {
	SITE_CITY,
	bakeryJsonLd,
	cataloguePriceRange,
	faqJsonLd,
	localityLine,
	websiteJsonLd,
} from "@/lib/seo";
import {
	getAvailabilityInputs,
	getCategories,
	getFaqs,
	getFeaturedProducts,
	getInstagramPosts,
	getReviews,
} from "@/lib/queries";
import { JsonLd } from "@/components/site/JsonLd";
import { ButtonLink } from "@/components/ui/Button";
import { Container, Section } from "@/components/ui/Container";
import { HairlineList, HairlineRow } from "@/components/ui/HairlineList";
import { Marquee } from "@/components/ui/Marquee";
import { ArchFrame } from "@/components/ui/ArchFrame";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { InstagramFeed } from "@/components/site/InstagramFeed";
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
 * No title here, so the home page takes the root layout's default and reads
 * "vvbakes | inspired desserts". That is deliberate and it is the client's
 * call, so do not "fix" it back.
 *
 * What it gives up: a title tag is one of the strongest things a page can say
 * about itself, and this one says nothing anybody searches for before they
 * have heard of the shop. A keyword-led title would have been the stronger
 * play for a query like "custom cakes Auckland".
 *
 * Why it is not much of a loss. The home page is not the page that should win
 * that query anyway: /shop and the product pages are the better landing pages
 * for somebody shopping, and both of those do lead with what they sell and
 * where. Google also rewrites a title it judges unhelpful for the query, often
 * from the H1 and the visible copy, and both of those are intact. For the
 * brand query itself, "vvbakes | inspired desserts" is exactly right.
 *
 * What carries the local signal here instead: the description below, the
 * eyebrow above the H1, the footer, and the `Bakery` node at the foot of this
 * file. If this page ever needs more, the H1 is the lever, not the title.
 *
 * The canonical has to be declared per page: `alternates` is inherited wholesale
 * in Next, so a single one on the layout would make every page claim to be "/".
 */
export const metadata: Metadata = {
	description: `Custom cakes, cupcakes, cookies and Indonesian bakes made to order in ${SITE_CITY}. Pick a date, send your brief, and I'll confirm by email with a price.`,
	alternates: { canonical: "/" },
};

/** What to mention when asking about a custom cake. */
const CUSTOM_PROMPTS = [
	{
		label: "The occasion",
		body: "Tell me what you're celebrating - birthdays, weddings, gatherings or just because!",
	},
	{
		label: "How many people",
		body: "I'll help you choose a size that gives everyone a good slice.",
	},
	{
		label: "Flavours",
		body: "Let me know your favourite flavours and anything to avoid. Please include any allergies or dietary requirements when you enquire.",
	},
	{
		label: "How you'd like it to look",
		body: "Share your ideas, colours or inspiration. Screenshots and photos are always welcome!",
	},
	{
		label: "When you need it",
		body: "Choose your preferred date from the calendar below. The more notice you give, the more options we'll have to make your cake just right.",
	},
];

/**
 * Words in a category name that keep their capital inside a sentence. The names
 * are typed in admin for a chip, so they arrive titled and want lower case
 * mid-prose, but "Indonesian" is a country rather than a style choice, and
 * stays capitalised wherever it lands. Add to this when a category is named
 * after a place.
 */
const CATEGORY_PROPER_NOUNS = ["Indonesian"];

/**
 * The categories as one readable phrase: lower case apart from the names above,
 * comma-separated with an ampersand before the last.
 */
function listCategories(names: string[]): string {
	const phrased = names.map((name) =>
		name
			.split(" ")
			.map((word) => (CATEGORY_PROPER_NOUNS.includes(word) ? word : word.toLowerCase()))
			.join(" "),
	);

	if (phrased.length < 2) {
		return phrased.join("");
	}

	return `${phrased.slice(0, -1).join(", ")} & ${phrased[phrased.length - 1]}`;
}

const STEPS = [
	{
		n: "01",
		title: "Tell me what you're after",
		body: "Choose from cakes, cupcakes, cookies, brownies and more. Let me know what you'd like, how many you need, and any flavours or special requests.",
	},
	{
		n: "02",
		title: "Choose your date",
		body: "Pick a date that works for you from the available dates below. I'll make sure your order is freshly baked and ready for you on the day. If the date is booked out, send a request through anyway and note it down in your request, and I'll see if I can fit it in for your preferred date (no guarantees though!).",
	},
	{
		n: "03",
		title: "I'll be in touch",
		body: "Once I've received your request, I'll get back to you with your order details, pricing and payment information. Nothing to pay until your order is confirmed.",
	},
];

export default async function HomePage() {
	const [
		{ settings, products, rules, overrides, counts },
		featured,
		categories,
		faqs,
		reviews,
		instagramPosts,
	] = await Promise.all([
		getAvailabilityInputs(),
		getFeaturedProducts(),
		getCategories(),
		getFaqs(),
		getReviews(),
		getInstagramPosts(),
	]);

	const availability = computeAvailability({
		settings,
		rules,
		overrides,
		counts,
	});
	const calendarMonths = buildPublicCalendar({ settings, rules, overrides, counts });

	const marqueeItems = products.length > 0 ? products.map((p) => p.name) : [settings.tagline];

	return (
		<>
			{/* Hero. A 12-column editorial split rather than a centred banner: the
			    headline holds the left, the logo holds the right. */}
			<Section tone="paper">
				<Container width="wide">
					<div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
						<div className="flex flex-col gap-6 lg:col-span-7">
							{/* Through `localityLine` rather than the bare suburb, so this reads
							    "made in Mt Roskill, Auckland" and not "made in Mt Roskill", which
							    only helps somebody who already knows where that is. It is also
							    the one place the city appears in visible copy above the fold,
							    which is worth more to a search engine than any tag. */}
							<SectionLabel>{`Sweet treats, made in ${localityLine(settings.pickupSuburb)}`}</SectionLabel>

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
									Start Order
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
						    buttons off the fold. */}
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

			{/* The Instagram grid. Proof that the oven is on this week, which is a
			    different thing from the menu and from the reviews: those say what
			    she sells and what people thought, this says she is still baking.
			    Copied down nightly by /api/cron/instagram, so the pictures are
			    ours and nothing on this page talks to Meta. An empty feed (before
			    the first sync, or with no token set) drops the band entirely. */}
			{instagramPosts.length > 0 ? (
				<Section tone="butter">
					<Container width="wide">
						<div className="mb-8 flex flex-wrap items-end justify-between gap-4">
							<div className="flex flex-col gap-2">
								<SectionLabel>Lately</SectionLabel>
								<h2 className="font-display text-3xl">My recent bakes</h2>
							</div>
							<a
								href={instagramUrl(settings.instagramHandle)}
								target="_blank"
								rel="noopener noreferrer"
								className="text-sm font-medium underline underline-offset-4">
								@{settings.instagramHandle} on Instagram
							</a>
						</div>

						<InstagramFeed posts={instagramPosts} />
					</Container>
				</Section>
			) : null}

			{/* Kind words. Between seeing the cakes and being asked to order one,
			    which is where someone decides whether to trust a home kitchen with
			    a birthday. Written in /admin/settings, and nothing is seeded, so a
			    site that has collected none simply does not have this band. */}
			{reviews.length > 0 ? (
				<Section
					tone="paper"
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
						<h2 className="font-display text-3xl">From choosing your treats to enjoying them</h2>
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
						<ButtonLink href="/order">Start Order</ButtonLink>
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
								Everything is baked fresh for the day you collect it. I take on a limited number of
								orders each day, so booking ahead helps make sure I can fit you in.
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
							bookingWindowDays={settings.bookingWindowDays}
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
									{/* The lead time is the rule; the fortnight is advice, and a custom
									    cake is the only thing it applies to. */}
									<span className="text-cocoa-soft block text-xs font-normal">
										Ideally 2-3 weeks for custom cakes
									</span>
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
								We bake {listCategories(categories.map((c) => c.name))}.
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

			{/* Separate nodes rather than one. The bakery says who and where, the FAQ
			    block says what she gets asked, and a crawler that understands only
			    one of them still gets the other. Both are built in lib/seo.ts, so
			    the product pages can point their `seller` at the same `@id` this
			    one publishes and Google reads the whole site as one business. The
			    `WebSite` node names the site itself, and belongs on this page only. */}
			<JsonLd data={websiteJsonLd()} />
			<JsonLd
				data={bakeryJsonLd({
					settings,
					ordersOpen: availability.ordersOpen,
					priceRangeText: cataloguePriceRange(products),
				})}
			/>
			<JsonLd data={faqJsonLd(faqs)} />
		</>
	);
}
