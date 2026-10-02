import type { MenuChoice } from "@/components/admin/OrderItemsEditor";
import type { Product } from "@/lib/types";

/** "Cupcakes (Chocolate)", the way `edit_order_items` names a line in the trail. */
export function lineLabel(productName: string, variantName: string | null): string {
	return variantName ? `${productName} (${variantName})` : productName;
}

/**
 * Everything on the menu that can be added to an order, one entry per flavour.
 *
 * Switched-off products and flavours are offered too, and say so: she may well
 * bake something for one customer that she has taken off the shop. Custom cakes
 * are not, because a line is only worth adding with the brief that goes with it.
 */
export function menuChoices(products: Product[]): MenuChoice[] {
	return products
		.filter((product) => !product.priceOnRequest)
		.flatMap((product) =>
			(product.variants.length > 0 ? product.variants : [null]).map((variant) => ({
				label:
					lineLabel(product.name, variant?.name ?? null) +
					(product.isAvailable && (variant?.isAvailable ?? true) ? "" : " (not on the shop)"),
				productId: product.id,
				variantId: variant?.id ?? null,
				step: product.qtyStep,
			})),
		);
}
