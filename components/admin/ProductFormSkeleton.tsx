import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";
import { AdminCard } from "./AdminShell";

/** Title width, then the number of fields under it, for each card the form draws. */
const CARDS: ReadonlyArray<{ title: string; fields: number }> = [
	{ title: "w-16", fields: 4 },
	{ title: "w-20", fields: 2 },
	{ title: "w-14", fields: 4 },
	{ title: "w-16", fields: 1 },
	{ title: "w-16", fields: 1 },
	{ title: "w-28", fields: 2 },
	{ title: "w-24", fields: 2 },
];

/**
 * The product editor, which both the add and the edit page draw.
 *
 * Seven stacked cards (Basics, Variants, Price, Extras, Photo, Availability,
 * Allergens) so the wait has the same height and rhythm as the form that replaces it, and
 * nothing below the fold jumps when it arrives.
 */
export function ProductFormSkeleton({ label }: { label: string }) {
	return (
		<SkeletonScreen label={label}>
			<div className="mb-6 flex flex-col gap-3">
				<Skeleton className="h-4 w-24" />
				<div className="flex flex-col gap-1.5">
					<Skeleton className="h-8 w-52" />
					<Skeleton className="h-4 w-36" />
				</div>
			</div>

			<div className="flex flex-col gap-5">
				{CARDS.map((card, index) => (
					<AdminCard key={index}>
						<Skeleton className={`mb-4 h-6 ${card.title}`} />
						<div className="flex flex-col gap-5">
							{Array.from({ length: card.fields }, (_, field) => (
								<div
									key={field}
									className="flex flex-col gap-2">
									<Skeleton className="h-4 w-28" />
									<Skeleton className="h-11 w-full" />
								</div>
							))}
						</div>
					</AdminCard>
				))}

				<div className="flex flex-wrap items-center gap-3">
					<Skeleton className="rounded-pill h-13 w-40" />
					<Skeleton className="h-4 w-32" />
				</div>
			</div>
		</SkeletonScreen>
	);
}
