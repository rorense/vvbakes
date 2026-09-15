import { ArchFrame } from "@/components/ui/ArchFrame";
import { Container, Section } from "@/components/ui/Container";
import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * One product. Without this the shop's own skeleton one segment up stands in for
 * it, and a page of cards turns into a page with a single photo on it.
 *
 * The arch is the real frame rather than a grey block: its colour never depends
 * on the product, so there is nothing to guess and the photo can simply appear
 * inside a window that was already there.
 */
export default function ProductLoading() {
	return (
		<Section
			tone="paper"
			size="tight">
			<Container width="wide">
				<SkeletonScreen label="Loading">
					<div className="mb-8 flex items-center gap-2">
						<Skeleton className="h-3 w-10" />
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-3 w-24" />
					</div>

					<div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
						<ArchFrame
							tone="blush"
							className="aspect-4/5 w-full"
						/>

						<div className="flex flex-col gap-6">
							<div className="flex flex-col gap-3">
								<Skeleton className="h-12 w-4/5" />
								<Skeleton className="h-5 w-full" />
								<Skeleton className="h-5 w-2/3" />
							</div>

							<div className="flex flex-col gap-2">
								<Skeleton className="h-3 w-12" />
								<div className="hairline-list">
									{Array.from({ length: 3 }, (_, index) => (
										<div
											key={index}
											className="flex items-center justify-between gap-4 py-3">
											<Skeleton className="h-4 w-32" />
											<Skeleton className="h-6 w-14" />
										</div>
									))}
								</div>
							</div>

							{/* The stepper and the add button. */}
							<div className="flex flex-wrap items-center gap-3">
								<Skeleton className="rounded-pill h-12 w-32" />
								<Skeleton className="rounded-pill h-12 w-40" />
							</div>

							<Skeleton className="h-4 w-3/4" />
						</div>
					</div>
				</SkeletonScreen>
			</Container>
		</Section>
	);
}
