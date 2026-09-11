import Link from "next/link";
import { adminOrders, adminSettings } from "@/lib/admin-queries";
import { cn } from "@/lib/cn";
import { formatDateShort, isIsoDate } from "@/lib/dates";
import { STATUS_TONES } from "@/lib/order-status";
import { formatMoney } from "@/lib/pricing";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/types";
import { AdminHeader, EmptyState } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orders" };

const FILTERS: Array<{ value: string; label: string }> = [
	{ value: "open", label: "Needs action" },
	{ value: "new", label: "New" },
	{ value: "confirmed", label: "Confirmed" },
	{ value: "ready", label: "Ready" },
	{ value: "collected", label: "Collected" },
	{ value: "cancelled", label: "Cancelled" },
	{ value: "all", label: "Everything" },
];

const STATUSES: OrderStatus[] = ["new", "confirmed", "ready", "collected", "cancelled"];

export default async function AdminOrdersPage({
	searchParams,
}: {
	searchParams: Promise<{ status?: string; date?: string; q?: string }>;
}) {
	const { status, date, q } = await searchParams;
	const { settings } = await adminSettings();

	const activeStatus =
		status === "all" || status === "open" || STATUSES.includes(status as OrderStatus)
			? status
			: "open";

	const orders = await adminOrders({
		status: activeStatus as OrderStatus | "all" | "open",
		date: isIsoDate(date ?? "") ? date : undefined,
		search: q?.trim() || undefined,
	});

	return (
		<>
			<AdminHeader
				title="Orders"
				description={`${orders.length} ${orders.length === 1 ? "order" : "orders"} shown`}
			/>

			<div className="mb-6 flex flex-col gap-4">
				<nav
					aria-label="Filter by status"
					className="rail -mx-4 flex gap-2 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
					{FILTERS.map((filter) => (
						<Link
							key={filter.value}
							href={`/admin/orders?status=${filter.value}`}
							aria-current={filter.value === activeStatus ? "page" : undefined}
							className={cn(
								"rounded-pill shrink-0 border px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors",
								filter.value === activeStatus
									? "border-cocoa bg-paper-deep"
									: "border-line hover:border-cocoa",
							)}>
							{filter.label}
						</Link>
					))}
				</nav>

				<form
					action="/admin/orders"
					className="flex flex-wrap gap-3">
					<input
						type="hidden"
						name="status"
						value={activeStatus}
					/>
					<input
						name="q"
						defaultValue={q ?? ""}
						placeholder="Name, email or reference"
						aria-label="Search orders"
						className="border-line bg-paper focus-visible:border-cocoa min-w-0 flex-1 rounded-md border px-4 py-2.5 text-base"
					/>
					<input
						name="date"
						type="date"
						defaultValue={date ?? ""}
						aria-label="Pickup date"
						className="border-line bg-paper focus-visible:border-cocoa rounded-md border px-4 py-2.5 text-base"
					/>
					<button
						type="submit"
						className="border-line hover:border-cocoa hover:bg-paper-deep rounded-pill border px-5 py-2.5 text-sm font-medium">
						Search
					</button>
				</form>
			</div>

			{orders.length === 0 ? (
				<EmptyState>
					No orders match that.{" "}
					<Link
						href="/admin/orders?status=all"
						className="underline underline-offset-4">
						Show everything
					</Link>
					.
				</EmptyState>
			) : (
				<ul className="hairline-list">
					{orders.map((order) => (
						<li key={order.id}>
							<Link
								href={`/admin/orders/${order.id}`}
								className="hover:bg-paper-deep -mx-2 flex flex-col gap-2 rounded-md px-2 py-4 sm:flex-row sm:items-center sm:justify-between">
								<span className="flex min-w-0 flex-col gap-0.5">
									<span className="flex items-center gap-2">
										<span className="truncate font-medium">{order.customerName}</span>
										<span
											className={cn(
												"rounded-pill text-2xs px-2 py-0.5 font-medium",
												STATUS_TONES[order.status],
											)}>
											{ORDER_STATUS_LABELS[order.status]}
										</span>
									</span>
									<span className="text-cocoa-soft text-xs">
										{order.reference} ·{" "}
										{order.itemCount === 0
											? "custom cake"
											: `${order.itemCount} ${order.itemCount === 1 ? "item" : "items"}`}
										{order.fulfilment === "delivery" ? " · delivery" : ""}
									</span>
								</span>

								<span className="flex shrink-0 items-center gap-4 text-sm">
									<span>{formatDateShort(order.pickupDate)}</span>
									<span
										className={
											order.totalCents === 0 ? "text-cocoa-soft text-xs" : "font-display text-lg"
										}>
										{order.totalCents === 0 ? "No price yet" : formatMoney(order.totalCents)}
									</span>
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}

			<p className="text-cocoa-soft mt-6 text-xs">
				Pickup dates are in {settings.timezone.replace("_", " ")}.
			</p>
		</>
	);
}
