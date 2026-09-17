/**
 * One made-up order, shared by the two email scripts.
 *
 *   scripts/preview-emails.mts   renders every template to .email-preview/
 *   scripts/send-test-email.mts  sends two of them to a real address
 *
 * They held a copy each, which is how `send-test-email.mts` came to be broken:
 * its `OrderItem`s were never given `extras`, and then never given the brief,
 * the custom flavour or `priceOnRequest` either, so `npm run emails:test` threw
 * before it sent anything. The preview script's copy had rotted the same way a
 * few days earlier and was repaired on its own. One copy cannot do that.
 *
 * Deliberately busy. Between them the three orders below cover a flavoured
 * line, a line with an extra on it, a line asking for a flavour of its own with
 * the frosting to match, a pickup time, a line with no price on it yet beside
 * one that has, inspiration photos and a link, and a cancellation reason — so a
 * template that drops one of them shows it here rather than on a customer's
 * order.
 */
import type { Order, PrivateSettings, SiteSettings } from "../lib/types";

/** An ordinary order: things off the menu, with a brief on one of the lines. */
export const order: Order = {
	id: "11111111-1111-1111-1111-111111111111",
	orderNumber: 1042,
	reference: "VV1042",
	token: "0123456789abcdef0123456789abcdef",
	status: "confirmed",
	fulfilment: "pickup",
	pickupDate: "2026-09-19",
	pickupTime: "16:30:00",
	customerName: "Alex Whitiora",
	customerEmail: "alex@example.com",
	customerPhone: "021 555 0100",
	deliveryAddress: null,
	notes: "One of the cupcakes needs to be nut free please, my niece is allergic.",
	customRequest: "Could you write 'Happy 30th Sam' on one of them?",
	inspirationImagePaths: [],
	inspirationUrl: null,
	// The menu lines plus the extras, which is how `place_order` adds it up:
	// $15.00 of cupcakes + $30.00 of candles on them + $5.00 of cookies. The
	// figure here was $20.00 — the two menu lines with the extras left out — so
	// the preview's total never matched the lines it was printed under.
	subtotalCents: 5000,
	deliveryFeeCents: 0,
	quoteCents: 0,
	totalCents: 5000,
	internalNotes: null,
	cancellationReason: "I'm unwell and can't bake that weekend. So sorry.",
	createdAt: "2026-09-11T02:00:00Z",
	confirmedAt: "2026-09-11T03:00:00Z",
	readyAt: null,
	collectedAt: null,
	cancelledAt: null,
	// Not asked yet, which is what every order looks like until the night after
	// its pickup date. The feedback-request preview renders the same either way;
	// this column decides whether the cron picks the order up, not what the
	// email says.
	feedbackRequestedAt: null,
	items: [
		{
			id: "item-1",
			productId: "p1",
			productVariantId: null,
			productName: "Cupcakes",
			variantName: "Chocolate",
			unitLabel: "each",
			qty: 5,
			lineTotalCents: 1500,
			pricingNote: "1 x 4 for $12.00 + 1 x $3.00 each",
			extras: [
				{
					id: "extra-1",
					extraId: "e1",
					name: "Candles",
					qty: 5,
					// Six candles on each of five cupcakes: the case the "x 6" in every
					// rendering of this is here to prove. 100c x 6 x 5.
					unitQty: 6,
					unitPriceCents: 100,
					lineTotalCents: 3000,
					sortOrder: 1,
				},
			],
			note: "Please keep this one away from the nut free ones.",
			inspirationUrl: null,
			inspirationImagePaths: [],
			customFlavour: null,
			frosting: null,
			frostingMatchesFlavour: false,
			priceOnRequest: false,
		},
		{
			id: "item-2",
			productId: "p2",
			productVariantId: null,
			productName: "Cookies",
			variantName: null,
			unitLabel: "each",
			qty: 2,
			lineTotalCents: 500,
			pricingNote: "2 x $2.50 each",
			extras: [],
			note: null,
			inspirationUrl: null,
			inspirationImagePaths: [],
			customFlavour: "Pandan, if you can get it",
			frosting: null,
			frostingMatchesFlavour: true,
			priceOnRequest: false,
		},
	],
};

/**
 * A custom cake: nothing off the menu, priced by the baker after she read the
 * request. This is the shape most of her orders take.
 */
export const customOrder: Order = {
	...order,
	reference: "VV1043",
	token: "abcdef0123456789abcdef0123456789",
	items: [],
	subtotalCents: 0,
	quoteCents: 8500,
	totalCents: 8500,
	customRequest:
		"30th birthday, about 12 people. Chocolate, not too sweet. Pale pink if you can, and 'Happy Birthday Sam' on top.",
	notes: "One guest is allergic to walnuts.",
	// The photo paths resolve against NEXT_PUBLIC_SUPABASE_URL, which is not set
	// when this runs from a bare checkout, so they render as the link alone. That
	// is the case worth previewing anyway: an email client that blocks remote
	// images sees exactly this.
	inspirationImagePaths: ["2026-09-11/example-one.webp", "2026-09-11/example-two.webp"],
	inspirationUrl: "https://www.pinterest.com/pin/1234567890/",
};

/**
 * The custom cake as it is ordered now: a product on the order like any other,
 * with no price on it until she has read the brief and set one.
 *
 * The one worth having a fixture for. It is the only shape where the total is
 * real, is not nothing, and is still not the whole total — so the line reads
 * "—" rather than $0.00, the figure reads "So far", and the note under it
 * has to say what is missing. Every other case is a total or it is not.
 */
export const customCakeOrder: Order = {
	...order,
	reference: "VV1044",
	token: "9876543210fedcba9876543210fedcba",
	status: "new",
	confirmedAt: null,
	subtotalCents: 1500,
	quoteCents: 0,
	totalCents: 1500,
	notes: "One guest is allergic to walnuts.",
	customRequest: null,
	items: [
		{
			id: "item-3",
			productId: "p3",
			productVariantId: "v3",
			productName: "Custom cake",
			variantName: "Ten to twelve people",
			unitLabel: "cake",
			qty: 1,
			lineTotalCents: 0,
			pricingNote: "Price to follow",
			extras: [
				{
					id: "extra-2",
					extraId: "e2",
					name: "Cake box and board",
					qty: 1,
					// One or none, which is what nearly every extra is and what every
					// order placed before the picker existed says.
					unitQty: 1,
					unitPriceCents: 1500,
					lineTotalCents: 1500,
					sortOrder: 2,
				},
			],
			note: "30th birthday, about 12 people. Not too sweet, pale pink if you can.",
			inspirationUrl: "https://www.pinterest.com/pin/1234567890/",
			inspirationImagePaths: ["2026-09-11/example-one.webp", "2026-09-11/example-two.webp"],
			customFlavour: "Pandan",
			frosting: null,
			frostingMatchesFlavour: true,
			priceOnRequest: true,
		},
	],
};

/**
 * The same cake once she has put a price on it.
 *
 * The pair matters more than either half. `hasUnpricedWork` and
 * `couldCostMore` in lib/pricing.ts both end in `&& quoteCents === 0`, which
 * is what makes every caveat disappear the moment she quotes: "So far" becomes
 * "Total", the line stops reading "—", and the notes underneath go. With only
 * an unquoted fixture that clause is never exercised, and a differential over
 * these previews will happily pass with it deleted — which is exactly what
 * happened on 2026-09-16 before this was added.
 *
 * `total_cents` is subtotal + delivery + quote, the same sum `saveQuote` makes.
 */
export const quotedCakeOrder: Order = {
	...customCakeOrder,
	reference: "VV1045",
	token: "fedcba9876543210fedcba9876543210",
	status: "confirmed",
	confirmedAt: "2026-09-11T04:00:00Z",
	quoteCents: 9000,
	totalCents: 10500,
};

export const settings: SiteSettings = {
	businessName: "vvbakes",
	tagline: "inspired desserts",
	aboutText: null,
	pickupSuburb: "Mt Roskill, Auckland",
	pickupInstructions: "Park on the street and come to the side door.",
	pickupWindowText: "Pickups 4–7pm",
	leadTimeDays: 2,
	cutoffTime: "20:00:00",
	bookingWindowDays: 28,
	timezone: "Pacific/Auckland",
	ordersOpen: true,
	ordersClosedMessage: null,
	deliveryEnabled: false,
	deliveryFeeCents: 0,
	deliveryAreaText: null,
	contactEmail: "hello@example.com",
	contactPhone: "021 555 0199",
	instagramHandle: "vv.bakes",
};

export const privateSettings: PrivateSettings = {
	bankAccountName: "V Example",
	bankAccountNumber: "12-3456-7890123-00",
	pickupAddress: "12 Example Road, Mt Roskill, Auckland 1041",
	notificationEmail: "orders@example.com",
};
