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
const LAST_UPDATED = "18 September 2026";

/**
 * The two numbers the cancellation clause turns on.
 *
 * They sit here rather than buried in the prose because they are the only part
 * of this page that is a business decision rather than a description of what
 * the site already does. Change them here and the sentences follow.
 */
const FULL_REFUND_DAYS = 7;
const NO_REFUND_HOURS = 72;

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
							point where we have an agreement, not the moment you press the button.
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
							in the email confirming it. Please use that reference, because it is how a payment is
							matched to an order.
						</p>
						<p>
							Card details are never asked for, by me or by this site. Nobody from{" "}
							{settings.businessName} will ever email you new bank details part-way through an
							order. If a message like that arrives, it is not from me, so check with {contact}{" "}
							before sending anything.
						</p>
						<p>
							If payment has not arrived by the time I need to shop for your order, I will chase it
							once. If it still has not arrived I may release the day to someone else.
						</p>
					</Clause>

					<Clause title="Changes &amp; cancellations">
						<p>
							I understand that plans can change. If you need to cancel or change your order, just
							let me know as soon as you can by responding to the order email ({contact}).
						</p>
						<Points>
							<li>
								<Term>More than {FULL_REFUND_DAYS} days before your collection date:</Term>{" "}
								you&rsquo;ll receive a full refund of anything you&rsquo;ve paid, unless I&rsquo;ve
								already purchased items specifically for your order, such as personalised cake
								toppers or decorations. In this case, I&rsquo;ll refund the amount that hasn&rsquo;t
								already been spent.
							</li>
							<li>
								<Term>Within {FULL_REFUND_DAYS} days:</Term> I may have already purchased items for
								your order. I&rsquo;ll refund what hasn&rsquo;t already been spent and let you know
								exactly what has been deducted.
							</li>
							<li>
								<Term>Within {NO_REFUND_HOURS} hours:</Term> your order may already be in
								preparation or production, so unfortunately I&rsquo;m unable to offer a refund.
							</li>
						</Points>
						<p>
							<Term>Need to change your date?</Term>
						</p>
						<p>
							Moving your order to another date isn&rsquo;t a cancellation. If your new date is
							available, I&rsquo;ll happily move your order across for you. I&rsquo;ll always do my
							best to accommodate a new date where I can.
						</p>
					</Clause>

					<Clause title="If I have to cancel">
						<p>
							A one-person kitchen has no second baker. If illness, an oven that has given up, or
							something else outside my control means I cannot make your order, I will tell you the
							moment I know and refund every cent you have paid.
						</p>
						<p>
							That refund is the whole of what I can put right in that situation. I cannot cover
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
							An order nobody collects on the day cannot be kept, because fresh baking does not
							wait. I will try the number on your order first, but after that day I cannot refund
							it.
						</p>
					</Clause>

					{settings.deliveryEnabled ? (
						<Clause title="Delivery">
							{/* The order form charges exactly this, so the sentence has to follow
							    the settings rather than describe a fee nothing collects. All
							    three branches are a real arrangement some shop wants, and the
							    middle one is hers: there is a fee, it depends on the address,
							    and it is quoted in the reply rather than added at checkout. */}
							{settings.deliveryFeeOnRequest ? (
								<p>
									Delivery is available for an additional fee, depending on your location and how
									far you are from {settings.pickupSuburb ?? "me"}. When you place your order,
									include your address and I&rsquo;ll confirm the delivery fee with you. Nothing is
									added for delivery at the checkout.
								</p>
							) : (
								<p>
									Delivery is available
									{settings.deliveryFeeCents > 0
										? ` for ${formatMoney(settings.deliveryFeeCents)}, added to your order when you choose it`
										: ", free of charge"}
									.
								</p>
							)}
							<p>
								Please check the address on your order carefully, because I deliver to the address
								you give me.
							</p>
							{/* Free text, so it gets a line of its own rather than being spliced
								into a sentence: the shop answers this with a whole sentence
								rather than a place name. */}
							{settings.deliveryAreaText ? (
								<p>
									<Term>Where I deliver:</Term> {settings.deliveryAreaText}
								</p>
							) : null}
							<p>
								Someone will need to be available to receive your order. Cakes and other delicate
								bakes can&rsquo;t safely be left outside, especially in warm weather. If nobody is
								available, I may need to take your order back with me, and you will then need to
								organise someone to pick up.
							</p>
						</Clause>
					) : null}

					<Clause title="Allergies &amp; ingredients">
						<p>
							As a <Term>home bakery</Term>, I work with a range of ingredients including nuts,
							gluten, dairy, eggs, soy and sesame. I use the same kitchen, equipment and workspace
							for different bakes, so I&rsquo;m <Term>unable to guarantee</Term> that any product is
							completely free from allergens or traces of allergens.
						</p>
						<p>
							If you have an allergy, please let me know when you place your order. I&rsquo;ll do my
							best to take extra care, including thoroughly cleaning my workspace and equipment
							between bakes where possible, and I&rsquo;ll always be honest about any potential
							cross-contact.
						</p>
						<p>
							For serious allergies, please get in touch before ordering so I can let you know
							whether I feel I can safely accommodate your request. If I don&rsquo;t think I can,
							I&rsquo;ll always let you know rather than take a risk.
						</p>
					</Clause>

					<Clause title="Once it is yours">
						<p>
							Everything is baked fresh, without the preservatives used to give supermarket desserts
							a longer shelf life.
						</p>
						<p>
							Your bake will always be at its best when it&rsquo;s fresh, so I&rsquo;ll let you know
							how to store it properly: whether it needs to be kept in the fridge, what&rsquo;s best
							at room temperature, and how long it will stay fresh.
						</p>
					</Clause>

					<Clause title="Photos you send me">
						<p>
							Inspiration photos are always welcome! They&rsquo;re a great way to show me the
							colours, style or little details you have in mind, which is why you can add them to
							your order.
						</p>
						<p>
							I&rsquo;ll use your inspiration as a guide and create something in that style, rather
							than making an exact copy. Every bake is made by hand, so there may be little
							differences along the way.
						</p>
					</Clause>

					<Clause title="Everything is made by hand">
						<p>
							The photos on this site are examples of bakes I&rsquo;ve made before and are here to
							give you an idea of what I can create. Your bake will be made especially for you, so
							small details may vary.
						</p>
					</Clause>

					<Clause title="Your rights under New Zealand law">
						<p>
							What I bake for you is covered by the <Term>Consumer Guarantees Act 1993</Term> and
							the <Term>Fair Trading Act 1986</Term>, where those laws apply. This includes
							requirements around things such as safety, quality and products being as described.
							Nothing in these terms is intended to take away any rights you have under New Zealand
							law. Where these terms and the law differ, the law takes priority.
						</p>
						<p>
							If you are ordering for a business rather than for personal or household use,
							different rules can apply. In some business-to-business transactions, the parties can
							agree in writing to contract out of the Consumer Guarantees Act, provided the legal
							requirements for doing so are met.
						</p>
					</Clause>

					<Clause title="If this page changes">
						<p>
							Anything that changes is posted here with a new date, and your order runs on the
							wording that was up when I confirmed it. Last updated {LAST_UPDATED}.
						</p>
						<p>
							Anything here you want explained, just ask: {contact}, or{" "}
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
