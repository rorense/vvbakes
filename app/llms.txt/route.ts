import { SEARCH_INDEXING } from "@/lib/constants";
import { llmsTxt } from "@/lib/llms";
import { getCatalogue, getFaqs, getSettings } from "@/lib/queries";

/**
 * /llms.txt, the plain-markdown summary of the shop written for the assistants
 * that answer questions about it. lib/llms.ts builds it and says why it exists.
 *
 * Served from a route handler rather than a file in public/ because every
 * sentence in it comes out of the database: the prices, the flavours, the
 * allergens, the pickup suburb and the questions are all hers to change in the
 * admin, and a copy checked into the repo would start lying the first time she
 * changed one.
 *
 * `force-dynamic` for exactly the reason app/sitemap.ts carries it, and it is
 * not a precaution: a prerendered route's Supabase reads go through Next's
 * persistent fetch cache, that cache lives in `.next/cache`, and Vercel
 * restores it between deploys, so the file would be built once and then answer
 * from a months-old catalogue without failing or warning. That defect shipped
 * in the sitemap on 2026-09-22. This file lists the same products with their
 * prices attached, so a stale copy of it quotes money that is no longer
 * charged.
 *
 * What it costs is three small queries on a request that arrives a few times a
 * day, and `getCatalogue` and `getFaqs` are the reads the shop page and the
 * home page already make.
 */
export const dynamic = "force-dynamic";

export async function GET() {
	const [settings, catalogue, faqs] = await Promise.all([getSettings(), getCatalogue(), getFaqs()]);

	return new Response(llmsTxt({ settings, catalogue, faqs }), {
		headers: {
			// text/plain rather than text/markdown so a browser shows the file
			// instead of offering to download it. The charset is not optional: the
			// catalogue carries names like "Lapis legit" and quote marks her
			// descriptions were typed with.
			"Content-Type": "text/plain; charset=utf-8",
			// The root layout puts `noindex` on every page while the shop is held
			// out of search, and a route handler renders no layout, so this is the
			// same rule said in the one place that can say it here. A file whose
			// whole purpose is to be read by a machine is exactly the thing that
			// would otherwise be indexed before launch.
			...(SEARCH_INDEXING ? {} : { "X-Robots-Tag": "noindex" }),
		},
	});
}
