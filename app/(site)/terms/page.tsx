import type { Metadata } from "next";
import Link from "next/link";
import { instagramUrl } from "@/lib/constants";
import { formatMoney } from "@/lib/pricing";
import { getSettings } from "@/lib/queries";
import { Container, Section } from "@/components/ui/Container";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Clause, Points, Term } from "@/components/site/Policy";

// Settings supply the business name, the contact address and the collection and
// delivery wording, so this is cached on the same timer as the rest of the
// public site and revalidated by hand when the admin saves settings.
export const revalidate = 3600;

export const metadata: Metadata = {
	title: "Terms",
	description:
		"When an order becomes an order, when to pay, what happens if a plan changes, and what is baked in this kitchen.",
	alternates: { canonical: "/terms" },
};

/**
 * When the wording below last changed. Bump it whenever a clause changes in a
 * way a customer would care about — not for a typo.
 */
const LAST_UPDATED = "17 September 2026";

/**
 * The two numbers the cancellation clause turns on.
 *
 * They sit here rather than buried in the prose because they are the only part
 * of this page that is a business decision rather than a description of what
 * the site already does. Change them here and the sentences follow.
 */
const FULL_REFUND_DAYS = 7;
const NO_REFUND_HOURS = 48;

export default async function TermsPage() {
	const settings = await getSettings();

	// Same fallback as the privacy page: a shop with no contact address on file
	// points people at Instagram rather than printing a dead "email me".
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

	// The shop page says this in the same words. A lead time of zero means the
	// shop takes same-day orders, and the sentence would be nonsense.
	const notice =
		settings.leadTimeDays > 0
			? `at least ${settings.leadTimeDays} day${settings.leadTimeDays === 1 ? "" : "s"}`
			: null;

	return (
		<Section
			tone="paper"
			size="tight">
			<Container width="narrow">
				<div className="mb-10 flex flex-col gap-3">
					<SectionLabel>Terms</SectionLabel>
					<h1 className="font-display text-4xl">How an order works</h1>
					<p className="text-cocoa-soft">
						{settings.businessName} is a one-person kitchen, so this is not a contract drafted by a
						legal department. It is the everyday understanding an order runs on: when it becomes a
						real order, when to pay, and what happens when a plan changes. Nothing here takes away a
						right New Zealand law gives you.
					</p>
				</div>

				<div className="flex flex-col gap-8">
					<Clause title="The short version">
						<Points>
							<li>
								Sending the form is a request. It becomes an order when I email back to confirm the
								day and the price.
							</li>
							<li>Payment is by bank transfer once I have confirmed, before I bake.</li>
							<li>
								Custom cakes are made for you and nobody else, so a late cancellation cannot always
								be refunded.
							</li>
							<li>
								Everything is baked in a home kitchen that also handles nuts, gluten, dairy and
								eggs.
							</li>
						</Points>
					</Clause>

					<Clause title="When an order becomes an order">
						<p>
							The order form sends me a request, not a booking. I check the day against what else is
							in the oven and email you back with a price and where to send it. That reply is the
							point where we have an agreement — not the moment you press the button.
						</p>
						<p>
							Sending the form does hold a place on that day while I look at it, so please only send
							one you mean. If you change your mind before I have replied, say so and I will put the
							day back.
						</p>
						<p>
							If I cannot do the date you picked, I will tell you and suggest the nearest one I can.
							Until an order is confirmed you owe nothing.
						</p>
						{notice ? (
							<p>
								Please allow {notice} notice for regular orders. For custom cakes, two to three
								weeks is ideal, so there is time to get your ideas right.
							</p>
						) : null}
					</Clause>

					<Clause title="What things cost">
						<p>
							Shop prices are for the item as its page describes it. A custom cake is quoted after I
							have read your brief, because size, tiers and detail all move the number.
						</p>
						<p>
							The price I confirm is the price you pay. Nothing is added at the end
							{settings.deliveryEnabled ? " except delivery, if you choose it" : ""}.
						</p>
						<p>
							If you change the design after I have confirmed, the price may change with it. I will
							tell you the new price and wait for a yes before doing the work.
						</p>
					</Clause>

					<Clause title="Paying">
						<p>
							Payment is by bank transfer. The account and the reference are on your order page and
							in the email confirming it. Please use that reference — it is how a payment is matched
							to a cake.
						</p>
						<p>
							Card details are never asked for, by me or by this site. Nobody from{" "}
							{settings.businessName} will ever email you new bank details part-way through an
							order. If a message like that arrives, it is not from me — check with {contact} before
							sending anything.
						</p>
						<p>
							If payment has not arrived by the time I need to shop for your order, I will chase it
							once. If it still has not arrived I may release the day to someone else.
						</p>
					</Clause>

					<Clause title="Changing or cancelling">
						<p>
							Plans change, and the earlier you tell me the easier it is. Email {contact} as soon as
							you know.
						</p>
						<Points>
							<li>
								<Term>More than {FULL_REFUND_DAYS} days before your date:</Term> cancel for any
								reason and anything you have paid comes back in full.
							</li>
							<li>
								<Term>Inside {FULL_REFUND_DAYS} days:</Term> the shopping is usually done, so I
								refund what I have not already spent on your order, and tell you plainly what that
								came to.
							</li>
							<li>
								<Term>Inside {NO_REFUND_HOURS} hours:</Term> your cake is already being made, and I
								cannot refund it. A cake with somebody else&rsquo;s name piped across it cannot be
								sold to anyone else.
							</li>
						</Points>
						<p>
							Moving to another date is not a cancellation. If the new day is free I will simply
							move you, as often as I can manage it.
						</p>
					</Clause>

					<Clause title="If I have to cancel">
						<p>
							A one-person kitchen has no second baker. If illness, an oven that has given up, or
							something else outside my control means I cannot make your order, I will tell you the
							moment I know and refund every cent you have paid.
						</p>
						<p>
							That refund is the whole of what I can put right in that situation — I cannot cover
							what you spent on the rest of the occasion.
						</p>
					</Clause>

					<Clause title="Collecting your order">
						<p>
							{settings.pickupSuburb
								? `Collection is from ${settings.pickupSuburb}. The exact address goes out once your order is confirmed, not before.`
								: "The collection address goes out once your order is confirmed, not before."}
						</p>
						{/* Free text, so it gets a line of its own rather than being spliced
						    into a sentence: this setting reads "To be discussed" as readily
						    as a set of hours. */}
						{settings.pickupWindowText ? (
							<p>
								<Term>Collection times:</Term> {settings.pickupWindowText}
							</p>
						) : null}
						<p>
							Please come inside the window we agreed. This is a home, not a shop with staff on a
							roster, so a collection two hours late is somebody waiting in their own kitchen for
							you. If you are running behind, a text is all it takes.
						</p>
						<p>
							An order nobody collects on the day cannot be kept — fresh baking does not wait. I
							will try the number on your order first, but after that day I cannot refund it.
						</p>
					</Clause>

					{settings.deliveryEnabled ? (
						<Clause title="Delivery">
							<p>
								Delivery is available
								{settings.deliveryFeeCents > 0
									? ` for ${formatMoney(settings.deliveryFeeCents)}`
									: ", free of charge"}
								. Please check the address on your order carefully, because I deliver to the address
								you give me.
							</p>
							{/* Free text again, and the shop currently answers it with a whole
							    sentence rather than a place name. */}
							{settings.deliveryAreaText ? (
								<p>
									<Term>Where I deliver:</Term> {settings.deliveryAreaText}
								</p>
							) : null}
							<p>
								Somebody needs to be there to take it. A cake cannot be left on a doorstep in the
								sun, and if nobody answers I will have to bring it home again — a second run, if
								there is time for one, is chargeable.
							</p>
							<p>
								Once a cake is handed over it is in your care. What happens to it in a hot car or on
								a back seat is beyond what I can stand behind, which is also why I would rather hand
								it to you myself than send it with a courier.
							</p>
						</Clause>
					) : null}

					<Clause title="Allergies, and what is in the food">
						<p>
							This is a <Term>home kitchen</Term>, not a factory with separate lines. The same
							bowls, benches and oven handle nuts, peanuts, wheat and gluten, dairy, eggs, soy and
							sesame, often on the same day.
						</p>
						<p>
							So I <Term>cannot guarantee</Term> that anything I make is free of an allergen,
							however carefully I work, and I will not pretend otherwise. Traces are possible in
							everything that leaves here.
						</p>
						<p>
							Tell me about an allergy before you order — in the notes, or by email — and I will
							tell you honestly whether I can make something for you. If the answer is that the risk
							is too high, that is the answer. I would rather lose the order.
						</p>
						<p>
							If you want to know exactly what is in something, ask and I will list the ingredients.
						</p>
					</Clause>

					<Clause title="Once it is yours">
						<p>
							Everything is baked fresh, without the preservatives that keep a supermarket cake
							going for a fortnight. It is at its best on the day. I will tell you how to keep
							whatever you have ordered — what needs the fridge, what hates it, and how long you
							really have.
						</p>
						<p>
							After it is handed over, how it is stored, carried and served is up to you, and that
							part I cannot stand behind.
						</p>
					</Clause>

					<Clause title="Photos you send me">
						<p>
							Inspiration photos are genuinely useful, which is why the order form takes them. Two
							things come with them.
						</p>
						<Points>
							<li>
								Send only photos you are free to send. If it is another baker&rsquo;s work I will
								take it as a starting point rather than copy it — their design is theirs.
							</li>
							<li>
								What you get is my hands making something in that spirit, not a reproduction. If an
								exact copy is what you are after, I am probably the wrong baker.
							</li>
						</Points>
						<p>
							Your photos are used for your order and nothing else. I do like to photograph my own
							finished bakes and put them on Instagram — if you would rather I did not post yours,
							say so and I will not.
						</p>
					</Clause>

					<Clause title="Everything is made by hand">
						<p>
							The photos on this site show what I have made before, not the thing you will receive.
							Colours mix slightly differently every time, fruit is whatever is good that week, and
							no two cakes are identical. That variation is the point of buying from a person.
						</p>
					</Clause>

					<Clause title="If something is not right">
						<p>
							Tell me — quickly, and with a photo if you can. The same day is ideal, because a
							problem with food is hard to look into a week later.
						</p>
						<p>
							If I have got something wrong I will put it right: a repair, a remake, or your money
							back, whichever fits what happened. I would far rather hear it from you than read it
							somewhere else.
						</p>
					</Clause>

					<Clause title="Your rights under New Zealand law">
						<p>
							What I bake for you is covered by the <Term>Consumer Guarantees Act 1993</Term> and
							the <Term>Fair Trading Act 1986</Term>. Food has to be safe, fit to eat and as
							described, and nothing on this page limits any of that. Where a clause here and the
							law disagree, the law wins.
						</p>
						<p>
							Those guarantees are for people buying for themselves. If you are ordering for a
							business — a café counter, a staff function billed to the company — they do not apply
							to that order, and the terms above stand on their own.
						</p>
					</Clause>

					<Clause title="If this page changes">
						<p>
							Anything that changes is posted here with a new date, and your order runs on the
							wording that was up when I confirmed it. Last updated {LAST_UPDATED}.
						</p>
						<p>
							Anything here you want explained, just ask — {contact}, or{" "}
							<Link
								href="/order"
								className="text-cocoa underline">
								the order form
							</Link>{" "}
							if it is about an order you are placing. What happens to your details is a separate
							page:{" "}
							<Link
								href="/privacy"
								className="text-cocoa underline">
								privacy
							</Link>
							.
						</p>
					</Clause>
				</div>
			</Container>
		</Section>
	);
}
