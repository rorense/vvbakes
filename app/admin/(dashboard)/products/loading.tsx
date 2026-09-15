import { Skeleton, SkeletonScreen } from "@/components/ui/Skeleton";

/** Roughly the widths of the chips a product row wears: category, price, flags. */
const CHIP_WIDTHS = ["w-20", "w-24", "w-16", "w-20"];

/**
 * The product list, which is two rows deep per product: the name and its
 * category above, the row of flag chips below. Five of them, which fills a phone
 * without pretending the shop is bigger than it is.
 */
export default function AdminProductsLoading() {
	return (
		<SkeletonScreen label="Loading products">
			<div className="mb-6 flex flex-wrap items-start justify-between gap-3">
				<div className="flex flex-col gap-2">
					<Skeleton className="h-8 w-36" />
					<Skeleton className="h-4 w-64" />
				</div>
				<div className="flex gap-2">
					<Skeleton className="rounded-pill h-11 w-28" />
					<Skeleton className="rounded-pill h-11 w-32" />
				</div>
			</div>

			<ul className="hairline-list">
				{Array.from({ length: 5 }, (_, index) => (
					<li key={index}>
						<div className="flex flex-col gap-3 py-4">
							<div className="flex items-start justify-between gap-4">
								<span className="flex flex-col gap-1.5">
									<Skeleton className="h-5 w-44" />
									<Skeleton className="h-3 w-32" />
								</span>
								<span className="flex items-center gap-1.5">
									<Skeleton className="size-8 rounded-md" />
									<Skeleton className="size-8 rounded-md" />
								</span>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								{CHIP_WIDTHS.map((width, chip) => (
									<Skeleton
										key={chip}
										className={`rounded-pill h-6 ${width}`}
									/>
								))}
							</div>
						</div>
					</li>
				))}
			</ul>
		</SkeletonScreen>
	);
}
