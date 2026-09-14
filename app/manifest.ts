import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: `${SITE_NAME} | ${SITE_TAGLINE}`,
		short_name: SITE_NAME,
		description: "Small-batch cupcakes, cookies and Indonesian-inspired cakes, baked to order.",
		start_url: "/",
		display: "standalone",
		background_color: "#fff8ea",
		theme_color: "#fff8ea",
		icons: [
			{ src: "/icon-192.png", sizes: "192x192", type: "image/png" },
			{ src: "/icon-512.png", sizes: "512x512", type: "image/png" },
		],
	};
}
