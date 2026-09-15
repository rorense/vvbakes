import { AdminCard } from "@/components/admin/AdminShell";
import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/**
 * The settings form runs to eight cards. Four are drawn here, which is already
 * past the fold on a phone — the rest arriving below what you can see costs
 * nothing, and a screen of eight pulsing card outlines is its own kind of noise.
 */
const CARDS: ReadonlyArray<{ title: string; fields: number }> = [
	{ title: "w-24", fields: 3 },
	{ title: "w-28", fields: 4 },
	{ title: "w-16", fields: 3 },
	{ title: "w-20", fields: 3 },
];

export default function AdminSettingsLoading() {
	return (
		<SkeletonScreen label="Loading settings">
			<div className="mb-6 flex flex-col gap-2">
				<Skeleton className="h-8 w-32" />
				<Skeleton className="h-4 w-80" />
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
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-11 w-full" />
								</div>
							))}
						</div>
					</AdminCard>
				))}
			</div>
		</SkeletonScreen>
	);
}
