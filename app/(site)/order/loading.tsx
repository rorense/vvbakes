import { Container, Section } from "@/components/ui/Container";
import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * The order page is `force-dynamic` and reads settings, products, rules,
 * overrides and the day's counts before it can draw a single bookable date, so
 * it is the longest wait on the public site and the one most worth showing.
 */
export default function OrderLoading() {
	return (
		<Section
			tone="paper"
			size="tight">
			<Container width="narrow">
				<SkeletonScreen label="Loading the order form">
					<div className="mb-10 flex flex-col gap-3">
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-10 w-full max-w-md" />
						<Skeleton className="h-4 w-full max-w-lg" />
						<Skeleton className="h-4 w-2/3" />
					</div>

					{/* The date picker, then the fields under it. */}
					<Skeleton className="mb-8 h-64 w-full rounded-lg" />

					<div className="flex flex-col gap-5">
						{Array.from({ length: 4 }, (_, index) => (
							<div
								key={index}
								className="flex flex-col gap-2">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-12 w-full" />
							</div>
						))}
						<Skeleton className="rounded-pill h-12 w-44" />
					</div>
				</SkeletonScreen>
			</Container>
		</Section>
	);
}
