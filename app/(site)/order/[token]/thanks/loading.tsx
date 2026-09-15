import { ArchFrame } from "@/components/ui/ArchFrame";
import { Container, Section } from "@/components/ui/Container";
import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * The gap between sending an order and being thanked for it.
 *
 * The order form pushes here itself once the action returns, so by this point
 * the submit button has already gone back to saying "Send", and without
 * something on screen the last thing someone sees after paying attention to a
 * form for five minutes is their own filled-in form, apparently unsent. The
 * status skeleton next door is the wrong shape for it — that page is a list,
 * this one is a badge in the middle of the screen.
 */
export default function OrderThanksLoading() {
	return (
		<Section tone="paper">
			<Container width="narrow">
				<SkeletonScreen label="Sending your order">
					<div className="flex flex-col items-center gap-9">
						<ArchFrame
							tone="blush"
							className="aspect-4/5 w-40 sm:w-48"
						/>

						<div className="flex w-full flex-col items-center gap-3">
							<Skeleton className="h-3 w-20" />
							<Skeleton className="h-12 w-4/5" />
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-3/4" />
						</div>

						<div className="hairline-list w-full">
							{["w-24", "w-28", "w-36"].map((width, index) => (
								<div
									key={index}
									className="flex items-center justify-between gap-4 py-3">
									<Skeleton className="h-4 w-28" />
									<Skeleton className={`h-4 ${width}`} />
								</div>
							))}
						</div>

						<div className="flex flex-wrap justify-center gap-3">
							<Skeleton className="rounded-pill h-13 w-44" />
							<Skeleton className="rounded-pill h-13 w-44" />
						</div>
					</div>
				</SkeletonScreen>
			</Container>
		</Section>
	);
}
