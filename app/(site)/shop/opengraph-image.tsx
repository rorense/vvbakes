import { OG_CONTENT_TYPE, OG_SIZE, shareCard } from "@/lib/og";

export const alt = "The vvbakes shop: cupcakes, cookies and Indonesian cakes";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
	return shareCard({
		eyebrow: "Shop",
		title: "Choose your favourites",
		body: "Cupcakes, cookies and Indonesian cakes, baked for the day you collect them.",
	});
}
