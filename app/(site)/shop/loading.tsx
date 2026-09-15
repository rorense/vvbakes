import { Container, Section } from "@/components/ui/Container";
import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/** Roughly the widths of the category names in the rail above the bands. */
const RAIL_WIDTHS = ["w-24", "w-20", "w-16", "w-28"];

/**
 * The shop is revalidated rather than dynamic, so a warm page arrives without
 * this ever being seen. It is for the cold one: a first visit, or the first hit
 * after the cache expires, which still waits on the whole catalogue.
 *
 * The bands are drawn on paper rather than in their real colours. A card grid
 * that turns out to be mint when the skeleton guessed rose is a worse arrival
 * than one that was never coloured in the first place.
 */
export default function ShopLoading() {
	return (
		<SkeletonScreen label="Loading the shop">
			<Section
				tone="paper"
				size="tight">
				<Container width="wide">
					<div className="flex flex-col gap-4">
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-12 w-full max-w-md" />
						<Skeleton className="h-4 w-full max-w-xl" />
						<Skeleton className="h-4 w-2/3 max-w-lg" />
					</div>

					<div className="mt-8 flex gap-2">
						{RAIL_WIDTHS.map((width, index) => (
							<Skeleton
								key={index}
								className={`rounded-pill h-10 shrink-0 ${width}`}
							/>
						))}
					</div>
				</Container>
			</Section>

			<div className="py-14 sm:py-20">
				<Container width="wide">
					<Skeleton className="mb-8 h-10 w-52" />

					<div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
						{Array.from({ length: 4 }, (_, index) => (
							<div
								key={index}
								className="flex flex-col gap-3">
								<div className="arch-soft aspect-4/5 w-full">
									<Skeleton className="h-full w-full" />
								</div>
								<div className="flex flex-col gap-2">
									<Skeleton className="h-6 w-4/5" />
									<Skeleton className="h-4 w-1/2" />
								</div>
							</div>
						))}
					</div>
				</Container>
			</div>
		</SkeletonScreen>
	);
}
