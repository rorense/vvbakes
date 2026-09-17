import { describe, expect, it, vi } from "vitest";

// `server-only` throws on import outside a React Server Component, and the
// module under test imports it. Same shim as lib/sync-rows.test.ts.
vi.mock("server-only", () => ({}));

const { needsRefresh, pictureUrlFor, postsToPrune, truncateCaption } = await import("./instagram");

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-17T03:00:00.000Z");

/** `now` plus this many days, as the API would give it back. */
function inDays(days: number): string {
	return new Date(NOW.getTime() + days * DAY).toISOString();
}

describe("pictureUrlFor", () => {
	it("takes the media URL for a photo", () => {
		expect(
			pictureUrlFor({ id: "1", media_type: "IMAGE", media_url: "https://cdn/photo.jpg" }),
		).toBe("https://cdn/photo.jpg");
	});

	it("takes the first slide for an album", () => {
		expect(
			pictureUrlFor({
				id: "1",
				media_type: "CAROUSEL_ALBUM",
				media_url: "https://cdn/slide-one.jpg",
			}),
		).toBe("https://cdn/slide-one.jpg");
	});

	it("takes the thumbnail for a video, never the video itself", () => {
		expect(
			pictureUrlFor({
				id: "1",
				media_type: "VIDEO",
				media_url: "https://cdn/reel.mp4",
				thumbnail_url: "https://cdn/reel.jpg",
			}),
		).toBe("https://cdn/reel.jpg");
	});

	// The whole point of the branch above: an MP4 in an <img> is a broken tile.
	it("gives up on a video with no thumbnail rather than serving the MP4", () => {
		expect(
			pictureUrlFor({ id: "1", media_type: "VIDEO", media_url: "https://cdn/reel.mp4" }),
		).toBeNull();
	});

	it("treats a type it has never seen as a picture", () => {
		expect(
			pictureUrlFor({ id: "1", media_type: "SOMETHING_NEW", media_url: "https://cdn/new.jpg" }),
		).toBe("https://cdn/new.jpg");
	});

	it("has nothing to show when the API sent no URLs at all", () => {
		expect(pictureUrlFor({ id: "1", media_type: "IMAGE" })).toBeNull();
	});
});

describe("needsRefresh", () => {
	it("refreshes a token whose expiry is not known", () => {
		expect(needsRefresh(null, NOW)).toBe(true);
	});

	it("refreshes a token whose expiry will not parse", () => {
		expect(needsRefresh("whenever", NOW)).toBe(true);
	});

	it("leaves a freshly issued sixty-day token alone", () => {
		expect(needsRefresh(inDays(60), NOW)).toBe(false);
	});

	// Around day fifty of sixty, leaving a week of daily runs to retry in.
	it("starts refreshing with ten days left", () => {
		expect(needsRefresh(inDays(11), NOW)).toBe(false);
		expect(needsRefresh(inDays(9), NOW)).toBe(true);
	});

	it("refreshes a token that has already expired", () => {
		expect(needsRefresh(inDays(-1), NOW)).toBe(true);
	});
});

describe("truncateCaption", () => {
	it("empties a blank caption to null", () => {
		expect(truncateCaption("   ")).toBeNull();
		expect(truncateCaption(null)).toBeNull();
		expect(truncateCaption(undefined)).toBeNull();
	});

	it("trims but otherwise leaves a normal caption alone", () => {
		expect(truncateCaption("  Lemon and elderflower.  ")).toBe("Lemon and elderflower.");
	});

	it("cuts a caption to Instagram's own ceiling", () => {
		const long = "a".repeat(2500);
		const cut = truncateCaption(long);

		expect(cut).toHaveLength(2200);
		expect(cut?.endsWith("…")).toBe(true);
	});

	it("leaves a caption of exactly the ceiling whole", () => {
		const exact = "a".repeat(2200);
		expect(truncateCaption(exact)).toBe(exact);
	});
});

describe("postsToPrune", () => {
	const stored = [{ id: "a" }, { id: "b" }, { id: "c" }];

	it("drops the stored posts the feed no longer lists", () => {
		expect(postsToPrune(stored, ["a", "c"])).toEqual([{ id: "b" }]);
	});

	it("drops nothing when the feed still lists them all", () => {
		expect(postsToPrune(stored, ["a", "b", "c"])).toEqual([]);
	});

	// A feed that comes back empty is far more likely to be a bad response than
	// the owner deleting her whole account, and acting on the guess would empty
	// the home page band with no way back until the next run.
	it("refuses to empty the table when the feed comes back empty", () => {
		expect(postsToPrune(stored, [])).toEqual([]);
	});

	it("ignores ids in the feed that were never stored", () => {
		expect(postsToPrune(stored, ["a", "b", "c", "d"])).toEqual([]);
	});
});
