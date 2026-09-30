import { ProductFormSkeleton } from "@/components/admin/ProductFormSkeleton";

/** Same shape as adding one: the editor is the same form either way. */
export default function EditProductLoading() {
	return <ProductFormSkeleton label="Loading product" />;
}
