import { notFound } from "next/navigation";
import { adminCategories, adminProduct } from "@/lib/admin-queries";
import { AdminHeader } from "@/components/admin/AdminShell";
import { ProductForm } from "@/components/admin/ProductForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const product = await adminProduct(id);
	return { title: product ? product.name : "Product" };
}

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const [product, categories] = await Promise.all([adminProduct(id), adminCategories()]);

	if (!product) notFound();

	return (
		<>
			<AdminHeader
				title={product.name}
				description={`/shop/${product.slug}`}
				back={{ href: "/admin/products", label: "Products" }}
			/>
			<ProductForm
				product={product}
				categories={categories}
			/>
		</>
	);
}
