import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { DemoBanner } from "@/components/site/DemoBanner";
import { SkipLink } from "@/components/ui/SkipLink";
import { getSettings, isDemoMode } from "@/lib/queries";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
	const settings = await getSettings();

	return (
		<>
			<SkipLink />
			{isDemoMode() ? <DemoBanner /> : null}
			<SiteHeader settings={settings} />
			<main id="main">{children}</main>
			<SiteFooter settings={settings} />
		</>
	);
}
