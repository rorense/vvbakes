import { adminSettings } from "@/lib/admin-queries";
import { isEmailConfigured } from "@/lib/email";
import { AdminHeader } from "@/components/admin/AdminShell";
import { SettingsForm } from "@/components/admin/SettingsForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
	const { settings, privateSettings } = await adminSettings();

	return (
		<>
			<AdminHeader
				title="Settings"
				description="How the shop describes itself, and the rules orders follow."
			/>
			<SettingsForm
				settings={settings}
				privateSettings={privateSettings}
				emailConfigured={isEmailConfigured()}
			/>
		</>
	);
}
