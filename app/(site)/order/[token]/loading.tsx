import { Container, Section } from "@/components/ui/Container";
import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * Someone following the link in their confirmation email, usually on a phone
 * and often on data. The page is never cached, so this is what they look at
 * while the order is fetched.
 */
export default function OrderStatusLoading() {
	return (
		<Section
			tone="paper"
			size="tight">
			<Container width="narrow">
				<SkeletonScreen label="Loading your order">
					<div className="mb-10 flex flex-col gap-3">
						<Skeleton className="h-3 w-32" />
						<Skeleton className="h-10 w-full max-w-sm" />
						<Skeleton className="h-4 w-full max-w-md" />
					</div>

					<div className="flex flex-col gap-8">
						{Array.from({ length: 3 }, (_, index) => (
							<div
								key={index}
								className="flex flex-col gap-3">
								<Skeleton className="h-3 w-28" />
								<Skeleton className="h-4 w-full" />
								<Skeleton className="h-4 w-3/4" />
							</div>
						))}
					</div>
				</SkeletonScreen>
			</Container>
		</Section>
	);
}
