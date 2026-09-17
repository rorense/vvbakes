import { Container, Section } from "@/components/ui/Container";
import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Same audience as the status page's skeleton next door: a phone, on data,
 * following a link out of an email. That page is never cached either. Two boxes
 * and a tick box, roughed in.
 */
export default function OrderFeedbackLoading() {
	return (
		<Section
			tone="paper"
			size="tight">
			<Container width="narrow">
				<SkeletonScreen label="Loading the form">
					<div className="mb-10 flex flex-col gap-3">
						<Skeleton className="h-3 w-32" />
						<Skeleton className="h-10 w-full max-w-sm" />
						<Skeleton className="h-4 w-full max-w-md" />
					</div>

					<div className="flex flex-col gap-6">
						<div className="flex flex-col gap-2">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-12 w-full" />
						</div>
						<div className="flex flex-col gap-2">
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-36 w-full" />
						</div>
						<Skeleton className="h-20 w-full" />
						<Skeleton className="rounded-pill h-13 w-40" />
					</div>
				</SkeletonScreen>
			</Container>
		</Section>
	);
}
