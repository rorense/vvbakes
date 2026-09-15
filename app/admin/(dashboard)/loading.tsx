import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * The fallback for every admin page without a shape of its own.
 *
 * The dashboard layout has already resolved by the time this renders, so the
 * nav and the sign-out row are real and only the content area is standing in.
 */
export default function AdminLoading() {
	return (
		<SkeletonScreen>
			<div className="mb-6 flex flex-col gap-2">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-4 w-64" />
			</div>

			<div className="flex flex-col gap-4">
				<Skeleton className="h-32 w-full rounded-lg" />
				<Skeleton className="h-32 w-full rounded-lg" />
			</div>
		</SkeletonScreen>
	);
}
