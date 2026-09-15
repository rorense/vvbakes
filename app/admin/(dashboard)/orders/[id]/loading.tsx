import { AdminCard } from "@/components/admin/AdminShell";
import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * One order, standing in for the four cards the real page draws: Order,
 * Customer, What they said, History. The back link is real text rather than a
 * bar, because it works during the wait and is the one thing the owner might
 * want while it goes on.
 */
export default function AdminOrderLoading() {
	return (
		<SkeletonScreen label="Loading order">
			<div className="mb-6 flex flex-col gap-3">
				<Skeleton className="h-4 w-28" />
				<div className="flex flex-col gap-1.5">
					<Skeleton className="h-8 w-44" />
					<Skeleton className="h-4 w-56" />
				</div>
			</div>

			<div className="flex flex-col gap-4">
				<AdminCard>
					<Skeleton className="mb-4 h-6 w-20" />
					<div className="flex flex-col gap-3">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-4/5" />
						<Skeleton className="h-4 w-2/3" />
					</div>
				</AdminCard>

				<AdminCard>
					<Skeleton className="mb-4 h-6 w-24" />
					<div className="flex flex-col gap-3">
						<Skeleton className="h-4 w-3/4" />
						<Skeleton className="h-4 w-1/2" />
					</div>
				</AdminCard>

				<AdminCard>
					<Skeleton className="mb-4 h-6 w-20" />
					<div className="flex flex-col gap-3">
						<Skeleton className="h-4 w-2/3" />
						<Skeleton className="h-4 w-1/2" />
					</div>
				</AdminCard>
			</div>
		</SkeletonScreen>
	);
}
