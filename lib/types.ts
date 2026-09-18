/**
 * Application-shaped types. Database rows arrive snake_case from Supabase and
 * are converted once, in lib/mappers.ts, so nothing above that layer has to
 * think about column names.
 */

export type OrderStatus = "new" | "confirmed" | "ready" | "collected" | "cancelled";
export type Fulfilment = "pickup" | "delivery";

/** The pastel a category paints its band and cards with. */
export type Accent = "rose" | "blush" | "butter" | "mint" | "peach";
export const ACCENTS: readonly Accent[] = ["rose", "blush", "butter", "mint", "peach"];

/**
 * The background class for an accent. Written out rather than interpolated
 * because Tailwind reads these as literal strings out of the source, and
 * `bg-${accent}` is not something it can see.
 *
 * One table, used by the shop's category bands, the product card's fallback
 * tile and the admin's colour swatches. Three copies used to disagree the
 * moment any one of them was tweaked.
 */
export const ACCENT_BG: Record<Accent, string> = {
	rose: "bg-rose",
	blush: "bg-blush",
	butter: "bg-butter",
	mint: "bg-mint",
	peach: "bg-peach",
};

export const ALLERGENS = ["gluten", "dairy", "egg", "nuts", "peanuts", "soy", "sesame"] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const ALLERGEN_LABELS: Record<Allergen, string> = {
	gluten: "Gluten",
	dairy: "Dairy",
	egg: "Egg",
	nuts: "Tree nuts",
	peanuts: "Peanuts",
	soy: "Soy",
	sesame: "Sesame",
};

/** Statuses a customer sees as forward progress, in order. */
export const ORDER_TIMELINE: readonly OrderStatus[] = ["new", "confirmed", "ready", "collected"];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
	new: "Received",
	confirmed: "Confirmed",
	ready: "Ready",
	collected: "Collected",
	cancelled: "Cancelled",
};

/** A bundle price, e.g. `{ qty: 4, priceCents: 1200 }` for "4 for $12". */
export interface PriceTier {
	qty: number;
	priceCents: number;
}

/**
 * One line of the starting prices shown on a product priced on request:
 * `6" - 2 layers, from $45`.
 *
 * A guide and nothing else. Nothing prices an order from these, and a line
 * priced on request still totals zero until the owner quotes it, so there is no
 * id here and no order pointing at one. See `Product.priceGuide`.
 */
export interface PriceGuideRow {
	/** What the price is for. Hers to word: '8" - 3 layers', 'Two tiers'. */
	label: string;
	priceCents: number;
	/**
	 * Shown as "+ $10" rather than "from $75", for the line that adds to one of
	 * the others instead of starting somewhere of its own.
	 */
	isAddition: boolean;
}

/**
 * One version of a product, with a price of its own: a flavour, a size, a
 * filling. The product owns the description; a variant is a name, a price, and
 * optionally a photo and extra allergens of its own.
 */
export interface ProductVariant {
	id: string;
	name: string;
	unitPriceCents: number;
	/**
	 * Object path inside the product-images bucket, not a URL. Null falls back
	 * to the product's photo, which is what a product whose variants differ only
	 * by size wants.
	 */
	imagePath: string | null;
	/**
	 * What this variant adds to the product's allergens, not a replacement for
	 * them: the carrot cake's walnuts, not the gluten all three share. See
	 * lib/allergens.ts.
	 */
	allergens: Allergen[];
	/** One flavour can sell out without taking the rest of the product with it. */
	isAvailable: boolean;
	sortOrder: number;
	/**
	 * The least of this combination an order may contain, counted on its own
	 * rather than with the rest of the product.
	 *
	 * Null is the ordinary answer and what every combination had before this
	 * existed: it counts towards `Product.minPerOrder` alongside every other
	 * one, which is what makes a minimum of four cupcakes met by three
	 * chocolate and one vanilla.
	 *
	 * The chiffon is what a number here is for. Eight is a rule about slices,
	 * and the whole cake sold beside them is one cake.
	 */
	minPerOrder: number | null;
	/**
	 * Which option this variant takes from each of the product's option groups,
	 * when the product has more than one. Empty for a product with one, where
	 * the variant *is* the option. See `optionGroups` in lib/pricing.ts.
	 */
	optionIds: string[];
}

/**
 * One option in one of a product's option groups: "Chocolate", "3 layers".
 *
 * The photo and the allergens belong here rather than on the variant because
 * they belong to the option: the walnuts are in the carrot cake at every number
 * of layers, and a nine-row matrix should not ask for the same photo nine
 * times.
 */
export interface ProductOption {
	id: string;
	name: string;
	/** Object path in the product-images bucket. Null falls back, see ProductVariant. */
	imagePath: string | null;
	/** Added to the product's allergens, never a replacement for them. */
	allergens: Allergen[];
	/** Off takes every combination made of this option with it. */
	isAvailable: boolean;
	sortOrder: number;
}

/**
 * One choice a product offers before it can be ordered: "Flavour", "Layers".
 *
 * A product with a single group stores no groups at all — the group is
 * `variantLabel` and its options are the variants themselves. `optionGroups`
 * in lib/pricing.ts is the only place that difference is handled; everything
 * above it sees a list of groups either way.
 */
export interface ProductOptionGroup {
	id: string;
	name: string;
	options: ProductOption[];
	sortOrder: number;
}

/**
 * Something paid that rides along with whatever was ordered: candles, a gift
 * box, a handwritten card.
 *
 * Belongs to one product and is edited on that product's own page, beside its
 * flavours and its bundle prices. Candles on a birthday cake are not candles on
 * a pack of cookies, and the price is not the same on a six-inch and a
 * three-tier, so there is no shop-wide list to keep in step.
 *
 * Priced per unit of the line it is added to, so two cakes with candles is two
 * sets of candles.
 *
 * Not a variant and not a product: a variant is *which* cake, and a product of
 * its own would put "candles" on the order with no cake attached to it.
 */
export interface Extra {
	id: string;
	name: string;
	/** The line under the name: "six, in the colour of your choice". */
	description: string | null;
	/** Per unit of the line. Zero is allowed and still worth offering. */
	priceCents: number;
	/**
	 * How many of this one a customer may add to an item.
	 *
	 * 1 is a plain tick box and is what nearly everything is: a gift box is one
	 * or none. Above 1 the product page puts a quantity picker beside the tick,
	 * because "candles" is really "however many candles", and the number is the
	 * whole question on a sixth birthday.
	 */
	maxQty: number;
	/** Off takes it off every product at once. */
	isAvailable: boolean;
	sortOrder: number;
}

export interface Category {
	id: string;
	name: string;
	slug: string;
	accent: Accent;
	sortOrder: number;
}

export interface Product {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	categoryId: string | null;
	unitPriceCents: number;
	/** "each", "slice", "box of 6". */
	unitLabel: string;
	/** Sold only in multiples of this. An item sold in pairs has step 2. */
	qtyStep: number;
	/**
	 * Smallest quantity of this product one order may contain, counted across
	 * every variant. Null for no minimum.
	 */
	minPerOrder: number | null;
	/**
	 * What each one beyond the minimum costs, when that is less than the first
	 * few. Null is the ordinary state: every one costs `unitPriceCents`.
	 *
	 * Mini cupcakes are the reason. They go out in boxes of twelve, two boxes is
	 * the smallest order at $17.50 a box, and every box after that is $15. Bundle
	 * tiers cannot say that: the tier table is searched for the *cheapest* way to
	 * make up a quantity, so a bundle priced above the unit rate is never chosen,
	 * and "$35 for the first two" is exactly that. Spelling it out instead as
	 * "3 for $50, 4 for $65, 5 for $80…" works until somebody wants six boxes and
	 * the row is not there.
	 *
	 * Counted from `minOrderQty`, so the first one of these is the first one past
	 * the minimum, or past the step size where there is no minimum.
	 *
	 * Per line, like the tiers and for the same reason: a price for N of this
	 * product is a price for N of one flavour, and mixing flavours inside it is a
	 * different promise. Two boxes in two flavours is two lines of one, so both
	 * are charged the first-box rate and come to the same $35.
	 */
	extraUnitPriceCents: number | null;
	tiers: PriceTier[];
	/**
	 * Starting prices, shown only where `priceOnRequest` is on. Everywhere else
	 * there is a real price table and this would be a second, vaguer answer to
	 * the same question. Empty is the ordinary state and shows nothing.
	 */
	priceGuide: PriceGuideRow[];
	/** The line under the price guide: what can move the price. Null hides it. */
	priceGuideNote: string | null;
	/**
	 * What this product calls its variants: "Flavour", "Size", "Filling".
	 *
	 * Only read when `optionGroups` is empty, where it names the single group
	 * the variants below are the options of.
	 */
	variantLabel: string;
	/** Empty for a product sold as one thing. */
	variants: ProductVariant[];
	/**
	 * The option groups this product offers, when it has more than one. Empty is
	 * the normal state: it means one group, named by `variantLabel`.
	 */
	optionGroups: ProductOptionGroup[];
	/**
	 * What can be added to this product: candles, a gift box, a card. Empty is
	 * the normal state and hides the picker entirely.
	 */
	extras: Extra[];
	/** Object path inside the product-images bucket, not a URL. */
	imagePath: string | null;
	imageAlt: string | null;
	/**
	 * More photos of the same thing, shown as a strip under the main one: the
	 * side of the cake, a slice cut out of it, one cupcake out of the box.
	 *
	 * Object paths in the same bucket as `imagePath`, in the order she put them
	 * in. Empty is the ordinary state and the product page shows no strip at all.
	 *
	 * Deliberately separate from `imagePath` rather than a list with the main
	 * photo at the front: the card, the basket and the share card all want one
	 * photo, and reordering the strip must not quietly change which one that is.
	 *
	 * No alt text of their own. See `galleryImageAlt` in lib/images.ts.
	 */
	galleryImagePaths: string[];
	isAvailable: boolean;
	isFeatured: boolean;
	availabilityNote: string | null;
	allergens: Allergen[];
	sortOrder: number;
	/**
	 * There is no price until the owner has seen what is being asked for.
	 *
	 * The card, the product page and the basket all say so rather than quoting
	 * the placeholder in `unitPriceCents`, the line adds nothing to the total,
	 * and the owner prices the order afterwards through the quote she could
	 * already set. A custom cake is the reason this exists.
	 */
	priceOnRequest: boolean;
	/**
	 * The product page asks for inspiration photos and a link as well as a note.
	 *
	 * Separate from `priceOnRequest` because the two only usually travel
	 * together: personalised cookies are made to a brief and still have a price.
	 */
	wantsBrief: boolean;
	/**
	 * The product page asks for a flavour of the customer's own, and for what
	 * the frosting should be.
	 *
	 * A third switch rather than a widening of `wantsBrief`, because it is a
	 * different question: the brief is "here is what I am picturing", this is
	 * "make it taste of pandan". She sells cupcakes in a flavour of your
	 * choosing and slices of pandan chiffon as they come, and asking the second
	 * one what flavour it should be is a question with no answer.
	 */
	wantsCustomFlavour: boolean;
	/**
	 * The product page offers every flavour at once with a count beside each,
	 * rather than one at a time.
	 *
	 * The minis are why. A box is one flavour and twenty-four is the smallest
	 * order, so the ordinary order is two boxes in two flavours, and asking one
	 * flavour at a time makes that two passes through the page with nothing
	 * saying the second pass exists.
	 *
	 * Hers to set, because what decides it is what the choice *means* and that
	 * is not in the schema. Seven flavours of cupcake want a list of numbers;
	 * the chiffon's two sizes are the same shape in the database and nobody
	 * orders half a six inch and half an eight.
	 *
	 * Only read where the product has exactly one option group. A product with
	 * more has no list to put numbers beside: the thing being counted is a
	 * combination, and the custom cake has a hundred and sixty of them.
	 */
	mixVariants: boolean;
	/**
	 * The product page asks "Anything to add?" at all.
	 *
	 * On for everything unless she turns it off. Some things come how they
	 * come, and a box inviting "writing on top, a colour" on a chiffon cake
	 * only invites a request she then has to turn down.
	 *
	 * Ignored where `wantsBrief` is on, because there the same box *is* the
	 * brief, and turning it off would leave a custom cake with nowhere to say
	 * what it should be.
	 */
	wantsNote: boolean;
	/**
	 * The grey line under the note box, in her words. Null uses the wording in
	 * components/order/BriefFields.tsx, which is the right answer for almost
	 * every product and the reason this is null rather than a copy of it.
	 */
	noteHint: string | null;
	/**
	 * The example inside the empty note box, in her words. Null falls back the
	 * same way `noteHint` does.
	 *
	 * What it is for: "No chocolate ganache please" is the thing people ask
	 * about the tiramisu and the thing nobody asks about a cookie.
	 */
	notePlaceholder: string | null;
	/**
	 * The line under the photo picker, in her words. Null uses the wording in
	 * components/order/InspirationPicker.tsx.
	 *
	 * Only ever read where `wantsBrief` is on, because that is the only place the
	 * picker is drawn. The default talks about a cake, which is what it is for on
	 * a custom cake and what it is not on a box of cupcakes.
	 */
	inspirationHint: string | null;
	/**
	 * What the brief and flavour questions call this, singular: "cake",
	 * "cupcake". Null says "cake", which is what they all said before there was
	 * a choice.
	 *
	 * Three sentences a customer reads are built from it: the custom flavour
	 * legend, the note about colouring the frosting, and the default note hint.
	 * They were written for the custom cake and asked a box of cupcakes about
	 * cakes.
	 *
	 * Pluralised by adding an s where the sentence needs it, which holds for
	 * cake, cupcake, cookie, brownie and slice. A word it does not hold for is a
	 * reason to widen this rather than to store the plural too.
	 */
	briefNoun: string | null;
}

/** A category with its products already attached, for the shop page. */
export interface CategoryWithProducts extends Category {
	products: Product[];
}

/**
 * One question and its answer, as shown on the home page.
 *
 * Owned by the baker, not by the code: the list is edited in /admin/settings and
 * an empty one hides the section.
 */
export interface Faq {
	id: string;
	question: string;
	answer: string;
	sortOrder: number;
}

/**
 * Something a customer said, as the baker chose to quote it.
 *
 * `detail` is the line under the name: an occasion, a suburb, a month. Optional,
 * because plenty of reviews are just a name.
 */
export interface Review {
	id: string;
	author: string;
	body: string;
	detail: string | null;
	sortOrder: number;
}

/**
 * What a customer said when she asked, and whether they agreed to be quoted.
 *
 * Not a `Review`, and deliberately not convertible into one by accident. This
 * is the private thing they typed; a review is the public thing she chose to
 * put up. `publishedAt` records that she made that choice, and is not a link
 * to the review it produced. See the migration for why there cannot be one.
 */
export interface Feedback {
	id: string;
	orderId: string;
	/** Their name as they gave it on the form, which the form warned may be shown. */
	author: string;
	body: string;
	/** They ticked the box. Without it the admin refuses to publish. */
	consented: boolean;
	/** When she copied it onto the website, or null. */
	publishedAt: string | null;
	createdAt: string;
}

/**
 * An address that asked not to be sent feedback requests.
 *
 * Never suppresses an order email. The address is the key rather than the
 * order, because somebody who says "stop sending me these" has not said it
 * about one cake.
 */
export interface FeedbackOptOut {
	email: string;
	/** The order whose email they pressed it from, or null once that order is gone. */
	orderId: string | null;
	/** "link" is the page with a button; "one-click" is their mail client's own. */
	source: string;
	createdAt: string;
}

/** Feedback with the order it came from, which is all the admin list needs of it. */
export interface FeedbackWithOrder extends Feedback {
	reference: string;
	/** YYYY-MM-DD. */
	pickupDate: string;
	customerName: string;
}

/**
 * One post from the Instagram feed, as the site stores it.
 *
 * Nothing here points at Instagram's CDN. `imagePath` is an object in our own
 * bucket, copied down by the cron, because the URLs the API returns stop
 * resolving after a few days. The only link back to Instagram is `permalink`,
 * which is the post's own page and is stable.
 */
export interface InstagramPost {
	/** Instagram's media id, kept as the primary key so a sync is an upsert. */
	id: string;
	permalink: string;
	caption: string | null;
	/** "IMAGE", "VIDEO", "CAROUSEL_ALBUM", or whatever Instagram adds next. */
	mediaType: string;
	/** Object path in the instagram bucket, not a URL. See lib/images.ts. */
	imagePath: string;
	/** When it was posted. The feed is ordered by this, newest first. */
	postedAt: string;
}

export interface SiteSettings {
	businessName: string;
	tagline: string;
	aboutText: string | null;
	pickupSuburb: string | null;
	pickupInstructions: string | null;
	pickupWindowText: string | null;
	leadTimeDays: number;
	/** "HH:MM:SS" in the business timezone. */
	cutoffTime: string;
	bookingWindowDays: number;
	/** IANA zone, e.g. "Pacific/Auckland". */
	timezone: string;
	ordersOpen: boolean;
	ordersClosedMessage: string | null;
	deliveryEnabled: boolean;
	deliveryFeeCents: number;
	/**
	 * The fee depends on the address and is confirmed by hand after the order.
	 *
	 * Nothing is charged for delivery at checkout when this is on, so
	 * `deliveryFeeCents` is held at 0 by a check constraint and the charge goes
	 * into the quote alongside a custom cake's price. It exists because 0 on its
	 * own can only say "free", and "there is a fee, I just cannot name it until
	 * I know where you are" is a different answer.
	 */
	deliveryFeeOnRequest: boolean;
	deliveryAreaText: string | null;
	contactEmail: string | null;
	contactPhone: string | null;
	instagramHandle: string;
}

/** Never sent to the browser except on a confirmed order's own status page. */
export interface PrivateSettings {
	bankAccountName: string | null;
	bankAccountNumber: string | null;
	pickupAddress: string | null;
	notificationEmail: string | null;
}

/** 0 = Sunday, matching both Postgres `extract(dow)` and JavaScript `getDay()`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WEEKDAY_NAMES: Record<Weekday, string> = {
	0: "Sunday",
	1: "Monday",
	2: "Tuesday",
	3: "Wednesday",
	4: "Thursday",
	5: "Friday",
	6: "Saturday",
};

export interface AvailabilityRule {
	weekday: Weekday;
	isOpen: boolean;
	capacity: number;
}

export interface AvailabilityOverride {
	/** YYYY-MM-DD. */
	date: string;
	isOpen: boolean;
	/** Null inherits the weekday rule's capacity. */
	capacity: number | null;
	note: string | null;
}

/** A date a customer may actually choose. */
export interface PickableDate {
	/** YYYY-MM-DD. */
	date: string;
	remaining: number;
	note: string | null;
}

export interface AvailabilityWindow {
	ordersOpen: boolean;
	closedMessage: string | null;
	/** YYYY-MM-DD, or null when orders are closed. */
	earliest: string | null;
	latest: string | null;
	dates: PickableDate[];
}

/** How the admin calendar paints a single day. */
export type DayState = "blocked" | "closed" | "open" | "full" | "past";

export interface CalendarDay {
	date: string;
	weekday: Weekday;
	inMonth: boolean;
	state: DayState;
	capacity: number;
	orderCount: number;
	note: string | null;
	hasOverride: boolean;
}

/**
 * How a day looks to a customer.
 *
 * Narrower than the admin's view on purpose: publishing how many orders are
 * already booked says more about the business than it needs to.
 *
 * A day blocked by hand is published as `full` rather than `closed`. The two
 * are the same answer to a customer, but not the same to someone reading the
 * grid: `closed` days sit in a pattern you can see, so one appearing midweek
 * looks like a mistake worth asking about, where `full` plainly says the date
 * is gone.
 */
export type PublicDayState =
	| "available"
	| "full"
	/** Open in principle, but inside the notice period. */
	| "too-soon"
	/** Not a baking day. A day blocked by hand is published as `full`. */
	| "closed"
	| "past"
	/** Beyond how far ahead she takes bookings. */
	| "not-yet-open";

export interface PublicCalendarDay {
	date: string;
	weekday: Weekday;
	inMonth: boolean;
	state: PublicDayState;
	note: string | null;
}

export interface PublicCalendarMonth {
	/** The first of the month, YYYY-MM-DD. */
	month: string;
	label: string;
	days: PublicCalendarDay[];
}

/**
 * What a customer said about one line, written on the product page.
 *
 * A note is offered on every product — "no sprinkles", "Happy Birthday Sam on
 * top" — and the photos and the link only where `Product.wantsBrief` is on.
 * All three belong to the line rather than to the order, because a basket
 * holding two custom cakes for two parties is two briefs.
 *
 * `photoIds` are keys into the browser's own photo store, not paths and not
 * URLs: the files themselves live in IndexedDB until the order is submitted,
 * and only then do they leave the browser. See lib/photo-store.ts.
 */
export interface CartBrief {
	note?: string;
	inspirationUrl?: string;
	photoIds?: string[];
	/**
	 * A flavour they asked for that is not on the menu, in their own words, on
	 * the products where `Product.wantsCustomFlavour` is on.
	 */
	customFlavour?: string;
	/**
	 * What they asked the frosting to be: a colour, or a flavour of its own.
	 *
	 * Never set alongside `frostingMatchesFlavour`. The two are one answer to
	 * one question, and `normaliseBrief` drops this one when the box is ticked,
	 * exactly as `place_order` does on the way into the order.
	 */
	frosting?: string;
	/**
	 * They asked for the frosting to taste of the flavour. Absent is the same as
	 * false, which is what every other line and every cart saved before this
	 * existed looks like.
	 */
	frostingMatchesFlavour?: boolean;
}

/**
 * One extra on a basket line, and how many of it.
 *
 * `qty` is per unit of the line, not for the line as a whole: two cakes each
 * carrying six candles is this at six, on a line of two. Anything the product
 * sells one of at a time is here at one, which is where every extra sat before
 * quantities existed.
 */
export interface CartExtra {
	id: string;
	qty: number;
}

export interface CartLine {
	productId: string;
	/**
	 * Which variant, for a product that has them. Null means the product itself,
	 * and so does the field being absent, which is what a cart saved before
	 * variants existed looks like.
	 */
	variantId?: string | null;
	/**
	 * The extras chosen for this line, each with how many of it.
	 *
	 * Absent is the same as none, which is what a cart saved before extras
	 * existed looks like.
	 *
	 * Part of what makes a line its own line: the same cake with candles and
	 * without are two lines at two prices, and so are six candles and one. See
	 * `cartLineKey` in lib/cart.ts.
	 */
	extras?: CartExtra[];
	/**
	 * What a cart saved before quantities existed holds instead: bare ids, each
	 * meaning one.
	 *
	 * Read on the way in and turned into `extras`, never written. It is here so
	 * that a basket someone filled last week still resolves rather than quietly
	 * losing its candles.
	 */
	extraIds?: string[];
	/**
	 * What was said about this line. Absent is the same as nothing, which is what
	 * most lines and every cart saved before briefs existed look like.
	 *
	 * Also part of what makes a line its own line, and more strongly than the
	 * extras are: two cakes described differently are two cakes however alike
	 * the rest of the line looks.
	 */
	brief?: CartBrief;
	qty: number;
}

export interface Cart {
	v: 1;
	lines: CartLine[];
}

/**
 * One extra as an order carried it, snapshotted at the moment it was placed.
 *
 * The name and the price are the order's own copy, so editing the list or
 * deleting the extra outright never rewrites what a customer was charged.
 * `extraId` is null once that happens and is only good for asking "what is this
 * one called now".
 */
export interface OrderItemExtra {
	id: string;
	extraId: string | null;
	name: string;
	/** The line's quantity: two cakes with candles is two sets. */
	qty: number;
	/**
	 * How many of the extra rode on each unit of the line: six candles on each
	 * of two cakes is 6 here and 2 above. 1 on everything ordered before the
	 * owner could offer more than one, which is most of them.
	 */
	unitQty: number;
	/** What one of them cost, not what the line's worth of them came to. */
	unitPriceCents: number;
	lineTotalCents: number;
	sortOrder: number;
}

export interface OrderItem {
	id: string;
	productId: string | null;
	productVariantId: string | null;
	productName: string;
	/** The flavour as it was named when the order was placed. */
	variantName: string | null;
	unitLabel: string;
	qty: number;
	/**
	 * What the menu charged for this line, and what `pricingNote` explains.
	 *
	 * Deliberately *not* including the extras: they are their own rows with their
	 * own totals, so both numbers go on being true and the order's subtotal is
	 * the sum of everything shown.
	 */
	lineTotalCents: number;
	pricingNote: string | null;
	/** Empty for a line nothing was added to, which is most of them. */
	extras: OrderItemExtra[];
	/** What the customer typed about this line. Offered on every product. */
	note: string | null;
	/** A link they gave for this line. Checked for scheme before it is rendered. */
	inspirationUrl: string | null;
	/** Object paths in the order-inspiration bucket, for this line. At most three. */
	inspirationImagePaths: string[];
	/** A flavour they asked for that was not on the menu, in their own words. */
	customFlavour: string | null;
	/**
	 * What they asked the frosting to be. Null when it matches the flavour, and
	 * null when they said nothing: `frostingMatchesFlavour` tells the two apart.
	 */
	frosting: string | null;
	/** They asked for the frosting to taste of the flavour. */
	frostingMatchesFlavour: boolean;
	/**
	 * This line had no price when the order was placed, so `lineTotalCents` is
	 * zero because nobody has priced it — not because it was free.
	 *
	 * Snapshotted like the name and the unit label beside it. Un-ticking
	 * "price on request" on the product later must not rewrite an order that
	 * went out saying the price was still to come.
	 */
	priceOnRequest: boolean;
}

export interface Order {
	id: string;
	orderNumber: number;
	reference: string;
	token: string;
	status: OrderStatus;
	fulfilment: Fulfilment;
	/** YYYY-MM-DD. */
	pickupDate: string;
	/**
	 * Roughly when they hope to collect, as "HH:MM:SS". Null when they did not
	 * say, which is most orders: the question is optional and an empty answer is
	 * a real one. A request rather than a booking — nothing counts capacity by
	 * it, and she confirms a time when she confirms the order.
	 */
	pickupTime: string | null;
	customerName: string;
	customerEmail: string;
	customerPhone: string;
	deliveryAddress: string | null;
	notes: string | null;
	/**
	 * The brief as it was asked for before the custom cake became a product:
	 * one description of the whole order, typed at the bottom of the order form.
	 *
	 * Nothing writes these three any more — a brief belongs to the line it
	 * describes, see `OrderItem` — but the orders that already carry one are
	 * still described by it, so every page that renders an order goes on reading
	 * both. Null on everything placed since.
	 */
	customRequest: string | null;
	/** Object paths in the order-inspiration bucket. At most three. Legacy, see above. */
	inspirationImagePaths: string[];
	/** A link the customer gave. Checked for scheme before rendering. Legacy, see above. */
	inspirationUrl: string | null;
	subtotalCents: number;
	deliveryFeeCents: number;
	/** What the owner quoted for custom work. Zero means not priced yet. */
	quoteCents: number;
	totalCents: number;
	internalNotes: string | null;
	cancellationReason: string | null;
	createdAt: string;
	confirmedAt: string | null;
	readyAt: string | null;
	collectedAt: string | null;
	cancelledAt: string | null;
	/** When the feedback request was sent. Null means it has not been asked for. */
	feedbackRequestedAt: string | null;
	items: OrderItem[];
}

/** An order row without its items, for list views. */
export type OrderSummary = Omit<Order, "items"> & { itemCount: number };

export interface OrderEvent {
	id: number;
	type:
		| "created"
		| "status_changed"
		| "email_sent"
		| "email_failed"
		| "email_bounced"
		| "email_complained"
		| "feedback_received"
		| "note";
	data: Record<string, unknown>;
	createdAt: string;
}

/**
 * What every server action returns. Actions never throw at the caller: a form
 * that fails should re-render with a message, not a crash page.
 */
export type ActionResult<T = undefined> =
	{ ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function actionOk(): ActionResult<undefined>;
export function actionOk<T>(data: T): ActionResult<T>;
export function actionOk<T>(data?: T): ActionResult<T | undefined> {
	return { ok: true, data };
}

export function actionError<T = undefined>(
	error: string,
	fieldErrors?: Record<string, string>,
): ActionResult<T> {
	return { ok: false, error, fieldErrors };
}
