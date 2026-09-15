import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/** Roughly the widths of "Needs action" through "Everything". */
const FILTER_WIDTHS = ["w-28", "w-16", "w-24", "w-20", "w-24", "w-24", "w-28"];

/**
 * Built to the orders page's own shape: title, the status rail, the search row,
 * then rows on the same hairline rhythm the real list uses. Six of them, which
 * is about a phone screen, so the swap does not jump.
 */
export default function AdminOrdersLoading() {
	return (
		<SkeletonScreen label="Loading orders">
			<div className="mb-6 flex flex-col gap-2">
				<Skeleton className="h-8 w-32" />
				<Skeleton className="h-4 w-28" />
			</div>

			<div className="mb-6 flex flex-col gap-4">
				<div className="-mx-4 flex gap-2 overflow-hidden px-4 sm:mx-0 sm:flex-wrap sm:px-0">
					{FILTER_WIDTHS.map((width, index) => (
						<Skeleton
							key={index}
							className={`rounded-pill h-10 shrink-0 ${width}`}
						/>
					))}
				</div>
				<Skeleton className="h-11 w-full" />
			</div>

			<ul className="hairline-list">
				{Array.from({ length: 6 }, (_, index) => (
					<li key={index}>
						<div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
							<span className="flex flex-col gap-1.5">
								<Skeleton className="h-5 w-40" />
								<Skeleton className="h-3 w-28" />
							</span>
							<span className="flex items-center gap-4">
								<Skeleton className="h-4 w-16" />
								<Skeleton className="h-6 w-20" />
							</span>
						</div>
					</li>
				))}
			</ul>
		</SkeletonScreen>
	);
}
