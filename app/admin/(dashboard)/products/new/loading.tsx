import { ProductFormSkeleton } from "@/components/admin/ProductFormSkeleton";

/**
 * Without this the list skeleton one segment up stands in for the editor, and
 * the owner watches a page of rows turn into a page of fields.
 */
export default function NewProductLoading() {
	return <ProductFormSkeleton label="Loading the product form" />;
}
