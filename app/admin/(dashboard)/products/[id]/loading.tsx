import { ProductFormSkeleton } from "@/components/admin/ProductFormSkeleton";

/**
 * Same shape as adding one. The title bar is wider here because the real page
 * puts the product's name in it, with its shop path underneath.
 */
export default function EditProductLoading() {
	return (
		<ProductFormSkeleton
			label="Loading product"
			back
		/>
	);
}
