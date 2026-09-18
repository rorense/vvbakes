import "server-only";

import { INSTAGRAM_FEED_LIMIT, INSTAGRAM_IMAGE_BUCKET } from "./constants";
import { instagramImagePath } from "./images";
import { createAdminClient } from "./supabase/admin";
import { hasSupabaseConfig } from "./supabase/env";

/**
 * Keeping the Instagram feed up to date.
 *
 * Everything here runs from the daily cron, never from a page render. See the
 * migration 20260917000004_instagram.sql for why the feed is a copy rather than
 * a live call; the short version is that Instagram's picture URLs expire within
 * days, the access token has to be rewritten every couple of months, and a
 * visitor's browser should not be talking to Meta to read a cake shop.
 *
 * The shape of one run:
 *
 *   1. Read the saved token, or take INSTAGRAM_ACCESS_TOKEN the first time.
 *   2. Trade it for a fresh sixty-day one if it is getting old, and save that.
 *   3. Ask for the latest posts.
 *   4. Download any picture not already in our bucket, then write its row.
 *   5. Delete rows, and pictures, for posts no longer in the feed.
 *
 * Every step after the first is allowed to fail without taking the rest down. A
 * refresh that fails leaves a token with weeks left on it and the sync goes
 * ahead; one post that will not download does not cost the other eleven. What
 * went wrong is written to `instagram_sync.last_error`, because the failure
 * this guards against is the silent one: the feed does not break, it quietly
 * stops being today's, and nobody notices for a month.
 */

/**
 * The pinned Instagram API version.
 *
 * Meta ships a version each quarter and supports each for about two years.
 * v23.0 is well documented and runs out around mid-2027; v26.0 is the newest at
 * the time of writing. Bumping is meant to be this one-line change, made
 * deliberately after reading the changelog, rather than whatever an unversioned
 * URL happens to resolve to on the day.
 */
const API_VERSION = "v23.0";

const MEDIA_ENDPOINT = `https://graph.instagram.com/${API_VERSION}/me/media`;

/**
 * Refreshing is documented without a version and behaves the same on all of
 * them, so it is left unversioned: one less thing to bump.
 */
const REFRESH_ENDPOINT = "https://graph.instagram.com/refresh_access_token";

const MEDIA_FIELDS = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";

/**
 * How close to expiry a token gets before it is traded in.
 *
 * Instagram issues sixty days and refuses to refresh a token younger than a
 * day, so ten days of headroom means the swap happens around day fifty with
 * more than a week of daily runs left to retry if one fails.
 */
const REFRESH_MARGIN_MS = 10 * 24 * 60 * 60 * 1000;

/** Instagram's own ceiling on a caption. Anything longer is theirs, not ours. */
const MAX_CAPTION_LENGTH = 2200;

/** Matches the bucket's limit. Instagram's downsized JPEGs are well under it. */
const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

/** What the bucket accepts, so a surprise is caught here with a readable message. */
const ALLOWED_PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

type PictureType = (typeof ALLOWED_PICTURE_TYPES)[number];

const PICTURE_EXTENSIONS: Record<PictureType, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

type AdminClient = ReturnType<typeof createAdminClient>;

/** One media item as the API returns it. Only the fields we ask for. */
export interface InstagramMedia {
	id: string;
	caption?: string | null;
	media_type?: string | null;
	media_url?: string | null;
	thumbnail_url?: string | null;
	permalink?: string | null;
	timestamp?: string | null;
}

export interface InstagramSyncResult {
	ok: boolean;
	/** Set when the job decided there was nothing to do. Not a failure. */
	skipped?: string;
	/** Whether the access token was traded for a fresh one this run. */
	refreshed?: boolean;
	/** Posts the API returned. */
	fetched?: number;
	/** Rows written. */
	stored?: number;
	/** Pictures copied into the bucket, which is the slow part. */
	downloaded?: number;
	/** Posts dropped because they are no longer in the feed. */
	pruned?: number;
	/** Everything that went wrong, the survivable included. */
	problems?: string[];
}

/**
 * The picture to show for one post.
 *
 * A video's `media_url` is the MP4, which is no use as a still, so a video with
 * no thumbnail has no picture at all rather than a broken one. An album reports
 * its first slide in `media_url`, which is the right cover.
 */
export function pictureUrlFor(media: InstagramMedia): string | null {
	if (media.media_type === "VIDEO") return media.thumbnail_url ?? null;
	return media.media_url ?? media.thumbnail_url ?? null;
}

/** True when a token is close enough to expiry to trade in, or its age is unknown. */
export function needsRefresh(expiresAt: string | null, now: Date): boolean {
	if (!expiresAt) return true;
	const expiry = Date.parse(expiresAt);
	if (Number.isNaN(expiry)) return true;
	return expiry - now.getTime() < REFRESH_MARGIN_MS;
}

/** A caption trimmed, emptied to null, and cut to a length the column will take. */
export function truncateCaption(caption: string | null | undefined): string | null {
	const trimmed = caption?.trim();
	if (!trimmed) return null;
	if (trimmed.length <= MAX_CAPTION_LENGTH) return trimmed;
	return `${trimmed.slice(0, MAX_CAPTION_LENGTH - 1)}…`;
}

/**
 * Which stored posts are no longer in the feed.
 *
 * An empty live list prunes nothing. A feed that comes back empty is far more
 * likely to be a permissions change or a bad response than the owner having
 * deleted every post she has, and emptying the table on that guess takes the
 * section off the home page with no way back until the next run.
 */
export function postsToPrune<T extends { id: string }>(
	stored: readonly T[],
	liveIds: readonly string[],
): T[] {
	if (liveIds.length === 0) return [];
	const live = new Set(liveIds);
	return stored.filter((row) => !live.has(row.id));
}

/** Runs one sync. Never throws: everything it knows comes back in the result. */
export async function syncInstagram(): Promise<InstagramSyncResult> {
	if (!hasSupabaseConfig() || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
		return { ok: true, skipped: "supabase is not configured" };
	}

	const supabase = createAdminClient();
	const now = new Date();
	const problems: string[] = [];

	const { data: state, error: stateError } = await supabase
		.from("instagram_sync")
		.select("*")
		.eq("id", 1)
		.maybeSingle();

	if (stateError) {
		return { ok: false, problems: [`could not read instagram_sync: ${stateError.message}`] };
	}

	let token = state?.access_token ?? process.env.INSTAGRAM_ACCESS_TOKEN ?? null;
	if (!token) {
		return { ok: true, skipped: "no Instagram access token" };
	}

	// A token seeded from the environment has no recorded expiry, so it reads as
	// unknown and gets refreshed on the first run that is allowed to.
	let expiresAt = state?.access_token ? (state.token_expires_at ?? null) : null;
	let refreshed = false;

	if (needsRefresh(expiresAt, now)) {
		try {
			const fresh = await refreshAccessToken(token);
			token = fresh.token;
			expiresAt = fresh.expiresAt;
			refreshed = true;
		} catch (error) {
			// Survivable, and usually temporary: the token in hand still has days
			// on it and tomorrow's run tries again. It turns fatal only if every
			// run between here and expiry fails, which is what last_error is for.
			problems.push(`token refresh failed: ${messageFrom(error)}`);
		}
	}

	// Saved before the media call, so a token seeded from the environment or
	// freshly refreshed survives even if everything after this fails.
	const { error: tokenError } = await supabase.from("instagram_sync").upsert(
		{
			id: 1,
			access_token: token,
			token_expires_at: expiresAt,
			...(refreshed ? { refreshed_at: now.toISOString() } : {}),
		},
		{ onConflict: "id" },
	);
	if (tokenError) problems.push(`could not save the token: ${tokenError.message}`);

	let media: InstagramMedia[];
	try {
		media = await fetchMedia(token);
	} catch (error) {
		return fatal(supabase, problems, `could not read the feed: ${messageFrom(error)}`, refreshed);
	}

	const { data: existing, error: existingError } = await supabase
		.from("instagram_posts")
		.select("id, image_path");

	if (existingError) {
		const why = `could not read stored posts: ${existingError.message}`;
		return fatal(supabase, problems, why, refreshed);
	}

	const knownPaths = new Map((existing ?? []).map((row) => [row.id, row.image_path]));
	const wanted = media.slice(0, INSTAGRAM_FEED_LIMIT);
	let stored = 0;
	let downloaded = 0;

	for (const item of wanted) {
		try {
			stored += await storePost(supabase, item, knownPaths.get(item.id) ?? null, () => {
				downloaded += 1;
			});
		} catch (error) {
			// One post that will not download is not worth losing the others over.
			problems.push(`post ${item.id}: ${messageFrom(error)}`);
		}
	}

	let pruned = 0;
	try {
		pruned = await prunePosts(
			supabase,
			existing ?? [],
			wanted.map((item) => item.id),
		);
	} catch (error) {
		problems.push(`could not prune old posts: ${messageFrom(error)}`);
	}

	await recordOutcome(supabase, { problems, syncedAt: stored > 0 ? now : null });

	return {
		ok: problems.length === 0,
		refreshed,
		fetched: media.length,
		stored,
		downloaded,
		pruned,
		...(problems.length > 0 ? { problems } : {}),
	};
}

/** Records a run that could not continue, then reports it. */
async function fatal(
	supabase: AdminClient,
	problems: string[],
	why: string,
	refreshed: boolean,
): Promise<InstagramSyncResult> {
	const all = [...problems, why];
	await recordOutcome(supabase, { problems: all });
	return { ok: false, refreshed, problems: all };
}

/** Trades a long-lived token for another sixty days. */
async function refreshAccessToken(token: string): Promise<{ token: string; expiresAt: string }> {
	const url = new URL(REFRESH_ENDPOINT);
	url.searchParams.set("grant_type", "ig_refresh_token");
	url.searchParams.set("access_token", token);

	const response = await fetch(url, { cache: "no-store" });
	const body = await readJson(response);

	if (!response.ok) throw new Error(describeApiError(body, response.status));

	const next = typeof body?.access_token === "string" ? body.access_token : null;
	const seconds = typeof body?.expires_in === "number" ? body.expires_in : null;
	if (!next || !seconds) throw new Error("the response carried no token");

	return { token: next, expiresAt: new Date(Date.now() + seconds * 1000).toISOString() };
}

async function fetchMedia(token: string): Promise<InstagramMedia[]> {
	const url = new URL(MEDIA_ENDPOINT);
	url.searchParams.set("fields", MEDIA_FIELDS);
	// A few more than are kept, so a post with no usable picture leaves a gap in
	// the candidates rather than in the grid.
	url.searchParams.set("limit", String(INSTAGRAM_FEED_LIMIT + 4));
	url.searchParams.set("access_token", token);

	const response = await fetch(url, { cache: "no-store" });
	const body = await readJson(response);

	if (!response.ok) throw new Error(describeApiError(body, response.status));
	return Array.isArray(body?.data) ? (body.data as InstagramMedia[]) : [];
}

/**
 * Writes one post, downloading its picture first if we do not have it already.
 *
 * The row goes in after the upload rather than before, so a run that times out
 * halfway leaves whole posts behind it instead of rows pointing at files that
 * were never written. Returns 1 when a row was written, 0 when the post had
 * nothing showable.
 */
async function storePost(
	supabase: AdminClient,
	media: InstagramMedia,
	knownPath: string | null,
	onDownload: () => void,
): Promise<number> {
	const permalink = media.permalink?.trim();
	const postedAt = media.timestamp ? Date.parse(media.timestamp) : Number.NaN;
	if (!permalink || Number.isNaN(postedAt)) return 0;

	let imagePath = knownPath;
	if (!imagePath) {
		const picture = pictureUrlFor(media);
		if (!picture) return 0;
		imagePath = await storePicture(supabase, media.id, picture);
		onDownload();
	}

	const { error } = await supabase.from("instagram_posts").upsert(
		{
			id: media.id,
			permalink,
			caption: truncateCaption(media.caption),
			media_type: media.media_type?.trim() || "IMAGE",
			image_path: imagePath,
			posted_at: new Date(postedAt).toISOString(),
		},
		{ onConflict: "id" },
	);

	if (error) throw new Error(error.message);
	return 1;
}

/** Copies one picture into our bucket and returns the path it landed at. */
async function storePicture(supabase: AdminClient, mediaId: string, url: string): Promise<string> {
	const response = await fetch(url, { cache: "no-store" });
	if (!response.ok) throw new Error(`the picture would not download (HTTP ${response.status})`);

	const header = response.headers.get("content-type") ?? "image/jpeg";
	const type = header.split(";")[0]!.trim().toLowerCase();
	if (!isPictureType(type)) throw new Error(`the picture came back as ${type}`);

	const bytes = new Uint8Array(await response.arrayBuffer());
	if (bytes.byteLength > MAX_PICTURE_BYTES) {
		throw new Error(`the picture is ${Math.round(bytes.byteLength / 1024)} KB, over the limit`);
	}

	const path = instagramImagePath(mediaId, PICTURE_EXTENSIONS[type]);
	const { error } = await supabase.storage
		.from(INSTAGRAM_IMAGE_BUCKET)
		.upload(path, bytes, { contentType: type, upsert: true });

	if (error) throw new Error(error.message);
	return path;
}

/** Drops posts no longer in the feed, pictures and all. */
async function prunePosts(
	supabase: AdminClient,
	stored: readonly { id: string; image_path: string }[],
	liveIds: readonly string[],
): Promise<number> {
	const stale = postsToPrune(stored, liveIds);
	if (stale.length === 0) return 0;

	// Files first: a row left behind by a failed delete is visible and fixable,
	// an orphaned file in a bucket is neither.
	const { error: fileError } = await supabase.storage
		.from(INSTAGRAM_IMAGE_BUCKET)
		.remove(stale.map((row) => row.image_path));
	if (fileError) throw new Error(fileError.message);

	const { error } = await supabase
		.from("instagram_posts")
		.delete()
		.in(
			"id",
			stale.map((row) => row.id),
		);
	if (error) throw new Error(error.message);

	return stale.length;
}

/** Records how the run went, so a silent failure has somewhere to be found. */
async function recordOutcome(
	supabase: AdminClient,
	{ problems, syncedAt }: { problems: readonly string[]; syncedAt?: Date | null },
): Promise<void> {
	const joined = problems.join(" · ");
	await supabase.from("instagram_sync").upsert(
		{
			id: 1,
			last_error: joined ? joined.slice(0, 2000) : null,
			...(syncedAt ? { synced_at: syncedAt.toISOString() } : {}),
		},
		{ onConflict: "id" },
	);
}

/**
 * A readable sentence from a Meta error body.
 *
 * Built from the body alone, never from the request. The access token travels
 * as a query parameter, so anything that echoes the URL (a thrown fetch error,
 * a logged request) puts a live credential in the logs.
 */
function describeApiError(body: Record<string, unknown> | null, status: number): string {
	const error = body?.error;
	const message =
		error && typeof error === "object" && "message" in error
			? (error as { message?: unknown }).message
			: null;
	return typeof message === "string" && message ? `${message} (HTTP ${status})` : `HTTP ${status}`;
}

function isPictureType(value: string): value is PictureType {
	return (ALLOWED_PICTURE_TYPES as readonly string[]).includes(value);
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
	try {
		return (await response.json()) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function messageFrom(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
