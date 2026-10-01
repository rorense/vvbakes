import { productImageUrl } from "@/lib/images";
import { OG_CONTENT_TYPE, OG_SIZE, SITE_CARD, shareCard } from "@/lib/og";
import { priceRule } from "@/lib/pricing";
import { getCategories, getProductBySlug } from "@/lib/queries";

/**
 * A card per product: its photo in the arch, its name as the headline.
 *
 * This replaces what `generateMetadata` next door used to do, which was to hand
 * the social networks the raw bucket URL. That photo is whatever shape it was
 * uploaded at, so it arrived cropped to somebody else's idea of a centre and
 * carried no branding — and a product with no photo yet set `images: undefined`,
 * which Next reads as "this page has declared its images" and so shipped no
 * preview at all.
 */
export const alt = "A cake from vvbakes";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const product = await getProductBySlug(slug);

	// A slug with no product renders the plain site card rather than throwing.
	// The page itself is already answering 404; there is no need for the image to
	// fail as well.
	if (!product) {
		return shareCard(SITE_CARD);
	}

	const categories = await getCategories();
	const category = categories.find((one) => one.id === product.categoryId);

	return shareCard({
		eyebrow: category?.name,
		title: product.name,
		body: product.description ?? priceRule(product),
		photoUrl: productImageUrl(product.imagePath),
	});
}
