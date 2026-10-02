import { adminProducts, adminSettings } from "@/lib/admin-queries";
import { menuChoices } from "@/lib/menu-choices";
import { AdminHeader } from "@/components/admin/AdminShell";
import { NewOrderForm } from "@/components/admin/NewOrderForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "New order" };

export default async function NewOrderPage() {
	const [products, settings] = await Promise.all([adminProducts(), adminSettings()]);

	return (
		<>
			<AdminHeader
				title="New order"
				description="For an order taken by text, message or in person."
				back={{ href: "/admin/orders", label: "Orders" }}
			/>
			<NewOrderForm
				menu={menuChoices(products)}
				deliveryEnabled={settings.deliveryEnabled}
			/>
		</>
	);
}
