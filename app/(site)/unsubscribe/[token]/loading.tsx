import { Container, Section } from "@/components/ui/Container";
import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Somebody who has decided to stop these and wants it over with, usually on a
 * phone. The page is never cached, so this is the wait. Kept to the shape of
 * the real one: a heading, the panel explaining what stays, and the button.
 */
export default function UnsubscribeLoading() {
	return (
		<Section
			tone="paper"
			size="tight">
			<Container width="narrow">
				<SkeletonScreen label="Loading your email settings">
					<div className="mb-10 flex flex-col gap-3">
						<Skeleton className="h-3 w-32" />
						<Skeleton className="h-10 w-full max-w-xs" />
						<Skeleton className="h-4 w-full max-w-md" />
					</div>

					<div className="flex flex-col gap-6">
						<Skeleton className="h-28 w-full" />
						<Skeleton className="rounded-pill h-13 w-48" />
					</div>
				</SkeletonScreen>
			</Container>
		</Section>
	);
}
