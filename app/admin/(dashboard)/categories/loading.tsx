import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Four category rows and the button under them. The colour swatch on each row is
 * a plain square rather than a coloured one, because guessing which accent a
 * category uses and getting it wrong is worse than not guessing.
 */
export default function AdminCategoriesLoading() {
	return (
		<SkeletonScreen label="Loading categories">
			<div className="mb-6 flex flex-col gap-3">
				<Skeleton className="h-4 w-24" />
				<div className="flex flex-col gap-1.5">
					<Skeleton className="h-8 w-40" />
					<Skeleton className="h-4 w-72" />
				</div>
			</div>

			<div className="flex flex-col gap-6">
				<ul className="hairline-list">
					{Array.from({ length: 4 }, (_, index) => (
						<li key={index}>
							<div className="flex items-center justify-between gap-4 py-4">
								<span className="flex items-center gap-3">
									<Skeleton className="size-8 shrink-0 rounded-md" />
									<span className="flex flex-col gap-1">
										<Skeleton className="h-5 w-32" />
										<Skeleton className="h-3 w-20" />
									</span>
								</span>
								<span className="flex shrink-0 items-center gap-1.5">
									<Skeleton className="size-8 rounded-md" />
									<Skeleton className="size-8 rounded-md" />
									<Skeleton className="rounded-pill h-6 w-12" />
								</span>
							</div>
						</li>
					))}
				</ul>

				<Skeleton className="rounded-pill h-11 w-36" />
			</div>
		</SkeletonScreen>
	);
}
