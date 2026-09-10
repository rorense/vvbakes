import Link from "next/link";
import { deleteProduct, moveProduct, toggleProductFlag } from "../actions";
import { adminCategories, adminProducts } from "@/lib/admin-queries";
import { priceRule } from "@/lib/pricing";
import { AdminHeader, EmptyState } from "@/components/admin/AdminShell";
import { ButtonLink } from "@/components/ui/Button";
import { ProductRow } from "@/components/admin/ProductRow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products" };

export default async function AdminProductsPage() {
	const [products, categories] = await Promise.all([adminProducts(), adminCategories()]);
	const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

	return (
		<>
			<AdminHeader
				title="Products"
				description="What appears in the shop, in the order it appears."
				action={
					<div className="flex gap-2">
						<ButtonLink
							href="/admin/categories"
							variant="secondary"
							size="sm">
							Categories
						</ButtonLink>
						<ButtonLink
							href="/admin/products/new"
							size="sm">
							Add product
						</ButtonLink>
					</div>
				}
			/>

			{products.length === 0 ? (
				<EmptyState>
					Nothing here yet.{" "}
					<Link
						href="/admin/products/new"
						className="underline underline-offset-4">
						Add your first product
					</Link>
					.
				</EmptyState>
			) : (
				<ul className="hairline-list">
					{products.map((product, index) => (
						<ProductRow
							key={product.id}
							product={product}
							categoryName={
								product.categoryId ? (categoryNames.get(product.categoryId) ?? null) : null
							}
							priceLabel={priceRule(product)}
							isFirst={index === 0}
							isLast={index === products.length - 1}
							onMove={moveProduct}
							onToggle={toggleProductFlag}
							onDelete={deleteProduct}
						/>
					))}
				</ul>
			)}
		</>
	);
}
