import Image from "next/image";
import { instagramImageUrl } from "@/lib/images";
import type { InstagramPost } from "@/lib/types";

/**
 * The Instagram grid.
 *
 * Square tiles in a tight grid, because that is the shape everyone already
 * reads as "this is her Instagram" — an arch frame here would look like another
 * row of product cards. No captions on the tiles for the same reason: the grid
 * is the recognisable thing, and the words are one tap away on the post itself.
 *
 * Every picture is served from our own bucket by next/image, so this renders
 * with the rest of the page and sends nothing to Meta until a visitor actually
 * clicks through. There is no embed script and no iframe.
 */
export function InstagramFeed({ posts }: { posts: readonly InstagramPost[] }) {
	const tiles = posts.map((post) => ({ post, url: instagramImageUrl(post.imagePath) }));

	return (
		<ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
			{tiles.map(({ post, url }) =>
				url ? (
					<li key={post.id}>
						<a
							href={post.permalink}
							target="_blank"
							rel="noopener noreferrer"
							className="group bg-paper-deep relative block aspect-square overflow-hidden rounded-md focus-visible:outline-offset-4">
							<Image
								src={url}
								alt={altTextFor(post)}
								fill
								sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
								className="object-cover transition-transform duration-300 group-hover:scale-105"
							/>
							{isMoving(post.mediaType) ? <MediaMark type={post.mediaType} /> : null}
						</a>
					</li>
				) : null,
			)}
		</ul>
	);
}

/**
 * Alt text for one tile.
 *
 * The caption is not a description of the picture, so this is a compromise
 * rather than a win: it is the only thing Instagram gives us that a person
 * wrote, and one real sentence beats "Instagram photo" twelve times over. The
 * first line is taken because a caption's tail is usually hashtags, and it is
 * cut short because alt text is read aloud in full.
 */
function altTextFor(post: InstagramPost): string {
	const firstLine = post.caption
		?.split("\n")
		.find((line) => line.trim().length > 0)
		?.trim();
	if (!firstLine) return "A post from vvbakes on Instagram";
	return firstLine.length > 120 ? `${firstLine.slice(0, 119)}…` : firstLine;
}

/** True for the post types where the tile is a still of something longer. */
function isMoving(mediaType: string): boolean {
	return mediaType === "VIDEO" || mediaType === "CAROUSEL_ALBUM";
}

/**
 * The corner mark on a video or an album.
 *
 * Instagram's own grid does this, and without it the tile promises a single
 * photo and delivers a reel. Decorative: what it means is already in the alt
 * text's destination, and a screen reader announcing "triangle" helps nobody.
 */
function MediaMark({ type }: { type: string }) {
	return (
		<span
			aria-hidden="true"
			// A hard shadow rather than a soft one: the mark sits on a photograph
			// nobody has vetted, and cream on cream icing is invisible.
			className="text-paper absolute top-2 right-2 drop-shadow-[0_1px_3px_rgb(0_0_0/0.6)]">
			{type === "VIDEO" ? (
				<svg
					viewBox="0 0 16 16"
					className="h-4 w-4"
					fill="currentColor">
					<path d="M4.5 2.6a.8.8 0 0 1 1.2-.7l7 5.4a.8.8 0 0 1 0 1.4l-7 5.4a.8.8 0 0 1-1.2-.7V2.6Z" />
				</svg>
			) : (
				<svg
					viewBox="0 0 16 16"
					className="h-4 w-4"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.6">
					<rect
						x="5.2"
						y="2.2"
						width="8.6"
						height="8.6"
						rx="1.6"
					/>
					<path d="M10.8 13.8H3.8a1.6 1.6 0 0 1-1.6-1.6V5.2" />
				</svg>
			)}
		</span>
	);
}
