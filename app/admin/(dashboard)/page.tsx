import Link from "next/link";
import { setOrdersOpen } from "./actions";
import { adminDashboard, adminSettings } from "@/lib/admin-queries";
import { addDays, formatDateShort, todayIn } from "@/lib/dates";
import { isEmailConfigured } from "@/lib/email";
import { formatMoney } from "@/lib/pricing";
import { STATUS_TONES } from "@/lib/order-status";
import { ORDER_STATUS_LABELS } from "@/lib/types";
import { cn } from "@/lib/cn";
import { AdminCard, AdminHeader, EmptyState } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today" };

export default async function AdminHomePage() {
	const { settings, privateSettings } = await adminSettings();
	const today = todayIn(settings.timezone);
	const { newCount, overdueCount, upcoming } = await adminDashboard(today, addDays(today, 7));

	// Things that will bite later if nobody notices them now.
	const warnings: string[] = [];
	if (!privateSettings.notificationEmail) {
		warnings.push("No notification email is set, so new orders won't reach your inbox.");
	}
	if (!privateSettings.bankAccountNumber) {
		warnings.push(
			"No bank account is set, so confirmation emails can't tell customers how to pay.",
		);
	}
	if (!isEmailConfigured()) {
		warnings.push("Email isn't configured on the server, so no emails are being sent at all.");
	}

	return (
		<>
			<AdminHeader
				title="Today"
				description={`${formatDateShort(today)} · ${settings.timezone.replace("_", " ")}`}
			/>

			<div className="flex flex-col gap-6">
				{warnings.length > 0 ? (
					<div className="border-danger bg-danger-tint rounded-lg border p-4">
						<h2 className="text-danger mb-2 text-sm font-medium">Needs your attention</h2>
						<ul className="text-danger flex list-disc flex-col gap-1 pl-5 text-sm">
							{warnings.map((warning) => (
								<li key={warning}>{warning}</li>
							))}
						</ul>
						<Link
							href="/admin/settings"
							className="text-danger mt-3 inline-block text-sm font-medium underline underline-offset-4">
							Open settings
						</Link>
					</div>
				) : null}

				<div className="grid gap-4 sm:grid-cols-3">
					<Tile
						label="New orders"
						value={String(newCount)}
						href="/admin/orders?status=new"
						highlight={newCount > 0}
					/>
					<Tile
						label="Next 7 days"
						value={String(upcoming.length)}
						href="/admin/orders?status=open"
					/>
					<Tile
						label="Past their date"
						value={String(overdueCount)}
						href="/admin/orders?status=open"
						highlight={overdueCount > 0}
					/>
				</div>

				<AdminCard>
					<form
						action={async () => {
							"use server";
							await setOrdersOpen(!settings.ordersOpen);
						}}
						className="flex flex-wrap items-center justify-between gap-4">
						<div className="flex flex-col gap-1">
							<p className="text-sm font-medium">
								{settings.ordersOpen ? "Taking orders" : "Orders are paused"}
							</p>
							<p className="text-cocoa-soft text-sm">
								{settings.ordersOpen
									? "Customers can place orders for any open date."
									: settings.ordersClosedMessage ||
										"The order form shows a message instead of the form."}
							</p>
						</div>
						<Button
							type="submit"
							variant={settings.ordersOpen ? "secondary" : "primary"}>
							{settings.ordersOpen ? "Pause orders" : "Start taking orders"}
						</Button>
					</form>
				</AdminCard>

				<AdminCard title="Coming up">
					{upcoming.length === 0 ? (
						<EmptyState>Nothing booked in the next week.</EmptyState>
					) : (
						<ul className="hairline-list">
							{upcoming.map((order) => (
								<li key={order.id}>
									<Link
										href={`/admin/orders/${order.id}`}
										className="hover:bg-paper-deep -mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-3">
										<span className="flex min-w-0 flex-col gap-0.5">
											<span className="truncate text-sm font-medium">{order.customerName}</span>
											<span className="text-cocoa-soft text-xs">
												{order.reference} ·{" "}
												{order.itemCount === 0
													? "custom cake"
													: `${order.itemCount} ${order.itemCount === 1 ? "item" : "items"}`}{" "}
												· {order.totalCents === 0 ? "no price yet" : formatMoney(order.totalCents)}
											</span>
										</span>
										<span className="flex shrink-0 items-center gap-3">
											<span
												className={cn(
													"rounded-pill text-2xs px-2.5 py-1 font-medium",
													STATUS_TONES[order.status],
												)}>
												{ORDER_STATUS_LABELS[order.status]}
											</span>
											<span className="text-sm">{formatDateShort(order.pickupDate)}</span>
										</span>
									</Link>
								</li>
							))}
						</ul>
					)}
				</AdminCard>
			</div>
		</>
	);
}

function Tile({
	label,
	value,
	href,
	highlight,
}: {
	label: string;
	value: string;
	href: string;
	highlight?: boolean;
}) {
	return (
		<Link
			href={href}
			className={cn(
				"flex flex-col gap-1 rounded-lg border p-4 transition-colors",
				highlight ? "border-cocoa bg-paper-deep" : "border-line hover:border-cocoa",
			)}>
			<span className="text-cocoa-soft text-2xs font-medium tracking-widest uppercase">
				{label}
			</span>
			<span className="font-display text-3xl">{value}</span>
		</Link>
	);
}
