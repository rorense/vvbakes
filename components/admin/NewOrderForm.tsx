"use client";

import { useActionState, useState } from "react";
import { createOrder } from "@/app/admin/(dashboard)/orders/actions";
import { EMPTY_FORM_STATE, errorFrom, fieldErrorsFrom } from "@/lib/action-state";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/Form";
import { HairlineList } from "@/components/ui/HairlineList";
import { AdminCard } from "./AdminShell";
import { DetailsFields } from "./OrderDetails";
import { AddedRows, addedItems, MenuSearch, type Added, type MenuChoice } from "./OrderItemsEditor";

/**
 * An order she took somewhere other than the shop, put in by hand.
 *
 * The same lines picker as "Change items" and the same fields as "Correct these
 * details", in one form. A save lands on the new order's own page.
 */
export function NewOrderForm({
	menu,
	deliveryEnabled,
}: {
	menu: MenuChoice[];
	deliveryEnabled: boolean;
}) {
	const [state, action, pending] = useActionState(createOrder, EMPTY_FORM_STATE);
	const errors = fieldErrorsFrom(state);
	const error = errorFrom(state);
	const [added, setAdded] = useState<Added[]>([]);

	return (
		<form
			action={action}
			className="flex flex-col gap-6">
			<input
				type="hidden"
				name="items"
				value={JSON.stringify(addedItems(added))}
			/>

			<AdminCard title="Order">
				<div className="flex flex-col gap-5">
					<p className="text-cocoa-soft text-sm">
						Priced at today&rsquo;s menu. The calendar is not checked, and nothing is emailed: once
						it is in, send the customer the order email from its page if you want them to have it.
					</p>
					{added.length > 0 ? (
						<HairlineList>
							<AddedRows
								added={added}
								onChange={setAdded}
							/>
						</HairlineList>
					) : null}
					<MenuSearch
						menu={menu}
						onChange={setAdded}
					/>
				</div>
			</AdminCard>

			<AdminCard title="Customer">
				<DetailsFields
					values={{
						pickupDate: "",
						pickupTime: null,
						fulfilment: "pickup",
						customerName: "",
						customerEmail: "",
						customerPhone: "",
						deliveryAddress: null,
						notes: null,
					}}
					errors={errors}
					deliveryEnabled={deliveryEnabled}
				/>
			</AdminCard>

			<div className="flex flex-wrap items-center gap-3">
				<Button
					type="submit"
					disabled={pending || added.length === 0}>
					{pending ? "Saving…" : "Add this order"}
				</Button>
			</div>

			{error ? <FormError>{error}</FormError> : null}
		</form>
	);
}
