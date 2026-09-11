import Image from "next/image";
import { cn } from "@/lib/cn";
import { inspirationImageUrl } from "@/lib/images";
import { isHttpUrl } from "@/lib/validation";

/**
 * The pictures a customer sent with their request.
 *
 * Shown in three places, all of them rendering the same thing: the admin, where
 * the cake is priced from it; the customer's own order page, so they can check
 * what actually arrived; and, as plain links, the owner's notification email.
 *
 * The link is checked for its scheme before it becomes an href. It is the one
 * piece of an order a stranger wrote, and `new URL()` is perfectly happy to
 * parse `javascript:`.
 */
export function Inspiration({
	paths,
	url,
	tile = "sm",
	className,
}: {
	paths: string[];
	url: string | null;
	/** Bigger tiles in the admin, where the cake is actually being priced. */
	tile?: "sm" | "lg";
	className?: string;
}) {
	const images = paths
		.map((path) => ({ path, url: inspirationImageUrl(path) }))
		.filter((image): image is { path: string; url: string } => image.url !== null);

	const link = url && isHttpUrl(url) ? url : null;
	if (images.length === 0 && !link) return null;

	const size = tile === "lg" ? "size-32 sm:size-40" : "size-24";

	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{images.length > 0 ? (
				<ul className="flex flex-wrap gap-3">
					{images.map((image, index) => (
						<li key={image.path}>
							<a
								href={image.url}
								target="_blank"
								rel="noreferrer"
								className="border-line hover:border-cocoa bg-paper-deep relative block overflow-hidden rounded-md border transition-colors">
								<span className={cn("relative block", size)}>
									<Image
										src={image.url}
										alt={`Inspiration photo ${index + 1}`}
										fill
										sizes="160px"
										className="object-cover"
									/>
								</span>
							</a>
						</li>
					))}
				</ul>
			) : null}

			{link ? (
				<p className="text-sm">
					<a
						href={link}
						target="_blank"
						rel="noreferrer"
						className="break-all underline underline-offset-2">
						{link}
					</a>
				</p>
			) : null}
		</div>
	);
}
