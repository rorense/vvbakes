import Link from "next/link";
import { adminCategories } from "@/lib/admin-queries";
import { AdminHeader, EmptyState } from "@/components/admin/AdminShell";
import { ProductForm } from "@/components/admin/ProductForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add product" };

export default async function NewProductPage() {
	const categories = await adminCategories();

	return (
		<>
			<AdminHeader
				title="Add a product"
				back={{ href: "/admin/products", label: "Products" }}
			/>

			{categories.length === 0 ? (
				<EmptyState>
					Add a category first. The shop groups products by{" "}
					<Link
						href="/admin/categories"
						className="underline underline-offset-4">
						categories
					</Link>{" "}
					are how the shop groups things.
				</EmptyState>
			) : (
				<ProductForm
					product={null}
					categories={categories}
				/>
			)}
		</>
	);
}
