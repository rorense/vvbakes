import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Built to the feedback page's own shape: title, then bordered cards with a
 * name, a line of detail and a paragraph of what they said. Four of them, which
 * is about a phone screen, so the swap does not jump.
 */
export default function AdminFeedbackLoading() {
	return (
		<SkeletonScreen label="Loading feedback">
			<div className="mb-6 flex flex-col gap-2">
				<Skeleton className="h-8 w-36" />
				<Skeleton className="h-4 w-44" />
			</div>

			<ul className="flex flex-col gap-3">
				{Array.from({ length: 4 }, (_, index) => (
					<li
						key={index}
						className="border-line flex flex-col gap-3 rounded-lg border p-4 sm:p-5">
						<div className="flex items-start justify-between gap-3">
							<span className="flex flex-col gap-1.5">
								<Skeleton className="h-5 w-32" />
								<Skeleton className="h-3 w-56" />
							</span>
							<Skeleton className="rounded-pill h-6 w-24 shrink-0" />
						</div>
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-4/5" />
						<Skeleton className="rounded-pill h-7 w-40" />
					</li>
				))}
			</ul>
		</SkeletonScreen>
	);
}
