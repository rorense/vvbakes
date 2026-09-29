import Link from "next/link";
import { ORDERS_PER_PAGE, adminOrders, adminSettings } from "@/lib/admin-queries";
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

const SORTS = [
	{ value: "newest", label: "Newest orders" },
	{ value: "pickup", label: "Pickup date" },
] as const;

const STATUSES: OrderStatus[] = ["new", "confirmed", "ready", "collected", "cancelled"];

export default async function AdminOrdersPage({
	searchParams,
}: {
	searchParams: Promise<{
		status?: string;
		date?: string;
		q?: string;
		page?: string;
		sort?: string;
	}>;
}) {
	const { status, date, q, page, sort } = await searchParams;

	const activeStatus: OrderStatus | "all" | "open" =
		status === "all" || status === "open" || STATUSES.includes(status as OrderStatus)
			? (status as OrderStatus | "all" | "open")
			: "open";

	const activeDate = isIsoDate(date ?? "") ? date : undefined;
	const search = q?.trim() || undefined;
	const activeSort = sort === "pickup" ? "pickup" : "newest";

	// A junk or negative ?page= lands on the first page rather than an error.
	const parsedPage = Number.parseInt(page ?? "", 10);
	const activePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 0;

	// The filters come from the URL, not from settings, so neither read has to
	// wait for the other.
	const [settings, { orders, hasMore }] = await Promise.all([
		adminSettings(),
		adminOrders({
			status: activeStatus,
			date: activeDate,
			search,
			sort: activeSort,
			page: activePage,
		}),
	]);

	/** A link back to this same list, keeping every filter, on another page. */
	function pageHref(target: number, sortBy: string = activeSort): string {
		const params = new URLSearchParams({ status: activeStatus });
		if (activeDate) params.set("date", activeDate);
		if (search) params.set("q", search);
		if (sortBy !== "newest") params.set("sort", sortBy);
		if (target > 0) params.set("page", String(target));
		return `/admin/orders?${params}`;
	}

	// Counting from one reads better than "page 0", and the running total tells
	// the owner where they are without a count query behind it.
	const firstShown = activePage * ORDERS_PER_PAGE + 1;
	const lastShown = activePage * ORDERS_PER_PAGE + orders.length;

	return (
		<>
			<AdminHeader
				title="Orders"
				description={
					orders.length === 0
						? "No orders shown"
						: activePage === 0 && !hasMore
							? `${orders.length} ${orders.length === 1 ? "order" : "orders"} shown`
							: `Orders ${firstShown}–${lastShown}`
				}
			/>

			<div className="mb-6 flex flex-col gap-4">
				<nav
					aria-label="Filter by status"
					className="rail -mx-4 flex gap-2 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
					{FILTERS.map((filter) => (
						<Link
							key={filter.value}
							href={`/admin/orders?status=${filter.value}${activeSort === "pickup" ? "&sort=pickup" : ""}`}
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
					{activeSort === "pickup" ? (
						<input
							type="hidden"
							name="sort"
							value="pickup"
						/>
					) : null}
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

				<nav
					aria-label="Sort orders"
					className="flex items-center gap-2 text-sm">
					<span className="text-cocoa-soft">Sort by</span>
					{SORTS.map((option) => (
						<Link
							key={option.value}
							href={pageHref(0, option.value)}
							aria-current={option.value === activeSort ? "page" : undefined}
							className={cn(
								"rounded-pill border px-3 py-1 font-medium whitespace-nowrap transition-colors",
								option.value === activeSort
									? "border-cocoa bg-paper-deep"
									: "border-line hover:border-cocoa",
							)}>
							{option.label}
						</Link>
					))}
				</nav>
			</div>

			{orders.length === 0 ? (
				<EmptyState>
					{activePage > 0 ? (
						<>
							Nothing on this page.{" "}
							<Link
								href={pageHref(0)}
								className="underline underline-offset-4">
								Back to the first
							</Link>
							.
						</>
					) : (
						<>
							No orders match that.{" "}
							<Link
								href="/admin/orders?status=all"
								className="underline underline-offset-4">
								Show everything
							</Link>
							.
						</>
					)}
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

			{activePage > 0 || hasMore ? (
				<nav
					aria-label="Order pages"
					className="border-line mt-6 flex items-center justify-between gap-3 border-t pt-4">
					{activePage > 0 ? (
						<Link
							href={pageHref(activePage - 1)}
							rel="prev"
							className="border-line hover:border-cocoa rounded-pill tap-safe border px-4 py-2 text-sm font-medium">
							&larr; {activeSort === "pickup" ? "Sooner" : "Newer"}
						</Link>
					) : (
						// Holds the gap so "Older" does not slide left on the first page.
						<span />
					)}

					{hasMore ? (
						<Link
							href={pageHref(activePage + 1)}
							rel="next"
							className="border-line hover:border-cocoa rounded-pill tap-safe border px-4 py-2 text-sm font-medium">
							{activeSort === "pickup" ? "Later" : "Older"} &rarr;
						</Link>
					) : (
						<span />
					)}
				</nav>
			) : null}

			<p className="text-cocoa-soft mt-6 text-xs">
				Pickup dates are in {settings.timezone.replace("_", " ")}.
			</p>
		</>
	);
}
