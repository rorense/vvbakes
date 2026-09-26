import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { DemoBanner } from "@/components/site/DemoBanner";
import { MiniCart } from "@/components/site/MiniCart";
import { SkipLink } from "@/components/ui/SkipLink";
import { getOrderableProducts, getSettings, isDemoMode } from "@/lib/queries";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
	const [settings, products] = await Promise.all([getSettings(), getOrderableProducts()]);

	return (
		<>
			<SkipLink />
			{isDemoMode() ? <DemoBanner /> : null}
			<SiteHeader settings={settings} />
			<main id="main">{children}</main>
			<SiteFooter settings={settings} />
			{/* Last, and straight inside the body, so it comes after everything
			    else in reading order and its sticky edge is held to the whole
			    page: at the end of the scroll it rests under the footer. */}
			<MiniCart products={products} />
		</>
	);
}
