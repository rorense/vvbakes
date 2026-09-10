import { adminCategories, categoryProductCounts } from "@/lib/admin-queries";
import { deleteCategory, moveCategory } from "../actions";
import { AdminHeader } from "@/components/admin/AdminShell";
import { CategoryManager } from "@/components/admin/CategoryManager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Categories" };

export default async function AdminCategoriesPage() {
	const [categories, counts] = await Promise.all([adminCategories(), categoryProductCounts()]);

	return (
		<>
			<AdminHeader
				title="Categories"
				description="The bands the shop is grouped into, and the colour each one uses."
				back={{ href: "/admin/products", label: "Products" }}
			/>
			<CategoryManager
				categories={categories}
				counts={counts}
				onMove={moveCategory}
				onDelete={deleteCategory}
			/>
		</>
	);
}
