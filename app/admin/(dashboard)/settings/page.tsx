import { adminPrivateSettings, adminSettings } from "@/lib/admin-queries";
import { isEmailConfigured } from "@/lib/email";
import { getFaqs, getReviews } from "@/lib/queries";
import { AdminHeader } from "@/components/admin/AdminShell";
import { SettingsForm } from "@/components/admin/SettingsForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
	const [settings, privateSettings, faqs, reviews] = await Promise.all([
		adminSettings(),
		adminPrivateSettings(),
		// Public tables with public read policies, so these are the same queries the
		// home page runs rather than session-scoped copies of them.
		getFaqs(),
		getReviews(),
	]);

	return (
		<>
			<AdminHeader
				title="Settings"
				description="How the shop describes itself, and the rules orders follow."
			/>
			<SettingsForm
				settings={settings}
				privateSettings={privateSettings}
				faqs={faqs}
				reviews={reviews}
				emailConfigured={isEmailConfigured()}
			/>
		</>
	);
}
