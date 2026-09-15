import { AdminCard } from "@/components/admin/AdminShell";
import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/** The real grid is always six rows, so this one is too and the card cannot resize. */
const WEEKS = 6;
const DAYS = 7;

/**
 * The baking calendar: a month grid, then the weekly pattern underneath it.
 *
 * This page reads settings, rules, overrides and three months of order counts
 * before it can colour a single square, and it is the tab most often opened
 * standing up with the oven on.
 */
export default function AvailabilityLoading() {
	return (
		<SkeletonScreen label="Loading the calendar">
			<div className="mb-6 flex flex-col gap-2">
				<Skeleton className="h-8 w-32" />
				<Skeleton className="h-4 w-72" />
			</div>

			<div className="flex flex-col gap-6">
				<AdminCard>
					<div className="mb-4 flex items-center justify-between gap-3">
						<Skeleton className="size-10 rounded-md" />
						<Skeleton className="h-7 w-40" />
						<Skeleton className="size-10 rounded-md" />
					</div>

					<div className="grid grid-cols-7 gap-1">
						{Array.from({ length: DAYS }, (_, day) => (
							<Skeleton
								key={`head-${day}`}
								className="mx-auto mb-1 h-3 w-6"
							/>
						))}
						{Array.from({ length: WEEKS * DAYS }, (_, cell) => (
							<Skeleton
								key={cell}
								className="aspect-square w-full"
							/>
						))}
					</div>

					{/* The legend under the grid: one entry per day state. */}
					<div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
						{["w-20", "w-24", "w-16", "w-24"].map((width, index) => (
							<Skeleton
								key={index}
								className={`h-3 ${width}`}
							/>
						))}
					</div>
				</AdminCard>

				<AdminCard>
					<Skeleton className="mb-4 h-6 w-36" />
					<Skeleton className="mb-5 h-4 w-full max-w-md" />
					<div className="flex flex-col gap-4">
						{Array.from({ length: DAYS }, (_, day) => (
							<div
								key={day}
								className="flex items-center justify-between gap-4">
								<span className="flex items-center gap-3">
									<Skeleton className="size-5 shrink-0" />
									<Skeleton className="h-4 w-24" />
								</span>
								<Skeleton className="h-10 w-20" />
							</div>
						))}
					</div>
				</AdminCard>
			</div>
		</SkeletonScreen>
	);
}
