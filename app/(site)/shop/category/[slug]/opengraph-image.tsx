import { productImageUrl } from "@/lib/images";
import { OG_CONTENT_TYPE, OG_SIZE, shareCard } from "@/lib/og";
import { getCategoryBySlug } from "@/lib/queries";
import { SITE_CITY } from "@/lib/seo";

/**
 * A card per category: its name and the city as the headline, the first photo
 * in it in the arch.
 *
 * The page next door declares its own `openGraph`, which replaces the root
 * layout's outright, image included. Until this file existed that left every
 * category link unfurling with no picture at all.
 */
export const alt = "Bakes from vvbakes in Auckland";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const category = await getCategoryBySlug(slug);
	const photo = category?.products.find((product) => product.imagePath)?.imagePath ?? null;

	// A slug with no category still gets a card, with the shop's own headline.
	// The page is already answering 404; the image need not fail as well.
	return shareCard({
		eyebrow: "Shop",
		title: category ? `${category.name} in ${SITE_CITY}` : "Choose your favourites",
		body: "Baked fresh for the day you collect them.",
		photoUrl: productImageUrl(photo),
	});
}
