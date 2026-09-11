import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
	? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
	: undefined;

const nextConfig: NextConfig = {
	images: {
		remotePatterns: supabaseHost
			? [
					{
						protocol: "https",
						hostname: supabaseHost,
						pathname: "/storage/v1/object/public/**",
					},
				]
			: [],
		formats: ["image/webp"],
	},
	experimental: {
		serverActions: {
			// An order can carry three inspiration photos, re-encoded in the browser
			// to roughly 400 KB each. The 1 MB default would refuse the second one.
			bodySizeLimit: "4mb",
		},
	},
	poweredByHeader: false,
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [
					{ key: "X-Content-Type-Options", value: "nosniff" },
					{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
					{ key: "X-Frame-Options", value: "DENY" },
				],
			},
		];
	},
};

export default nextConfig;
