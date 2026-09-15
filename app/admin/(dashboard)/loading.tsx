import { AdminCard } from "@/components/admin/AdminShell";
import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Today, and the fallback for any admin page without a shape of its own.
 *
 * Now that every other section has one, this is really the dashboard's: the
 * three counts across the top, the orders-open switch, and the week ahead. The
 * dashboard layout has already resolved by the time it renders, so the nav and
 * the sign-out row are real and only the content area is standing in.
 */
export default function AdminLoading() {
	return (
		<SkeletonScreen label="Loading the dashboard">
			<div className="mb-6 flex flex-col gap-2">
				<Skeleton className="h-8 w-28" />
				<Skeleton className="h-4 w-56" />
			</div>

			<div className="flex flex-col gap-6">
				<div className="grid gap-4 sm:grid-cols-3">
					{Array.from({ length: 3 }, (_, index) => (
						<div
							key={index}
							className="border-line flex flex-col gap-2 rounded-lg border p-4">
							<Skeleton className="h-3 w-24" />
							<Skeleton className="h-9 w-10" />
						</div>
					))}
				</div>

				<AdminCard>
					<div className="flex flex-wrap items-center justify-between gap-4">
						<div className="flex flex-col gap-2">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-4 w-64" />
						</div>
						<Skeleton className="rounded-pill h-11 w-36" />
					</div>
				</AdminCard>

				<AdminCard>
					<Skeleton className="mb-4 h-6 w-28" />
					<ul className="hairline-list">
						{Array.from({ length: 4 }, (_, index) => (
							<li key={index}>
								<div className="flex items-center justify-between gap-4 py-3">
									<span className="flex flex-col gap-1">
										<Skeleton className="h-4 w-32" />
										<Skeleton className="h-3 w-44" />
									</span>
									<span className="flex shrink-0 items-center gap-3">
										<Skeleton className="rounded-pill h-6 w-20" />
										<Skeleton className="h-4 w-14" />
									</span>
								</div>
							</li>
						))}
					</ul>
				</AdminCard>
			</div>
		</SkeletonScreen>
	);
}
