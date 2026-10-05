import { UserError } from "./errors.ts";
import { parseLink, spotifyTrackUrl } from "./links.ts";

export interface SpotifyTrack {
  id: string;
  title: string;
  artists: string[];
  album: string | null;
  durationSec: number;
  artworkUrl: string | null;
}

type Fetch = typeof fetch;

const REQUEST_HEADERS = {
  // Spotify only renders the Open Graph tags server-side for non-browser
  // clients; a full desktop-browser user agent gets an empty app shell.
  "user-agent": "Mozilla/5.0 (compatible; song-visualizer/0.1)",
  "accept-language": "en-US,en;q=0.9",
};

/**
 * Looks up a track's title, artists, album and length without an API key by
 * reading Spotify's public embed page and track page.
 */
export async function fetchSpotifyTrack(trackId: string, fetchImpl: Fetch = fetch): Promise<SpotifyTrack> {
  const [embed, page] = await Promise.allSettled([
    getText(`https://open.spotify.com/embed/track/${trackId}`, fetchImpl).then(parseEmbedPage),
    getText(spotifyTrackUrl(trackId), fetchImpl).then(parseTrackPage),
  ]);
  const fromEmbed = embed.status === "fulfilled" ? embed.value : null;
  const fromPage = page.status === "fulfilled" ? page.value : null;

  const title = fromEmbed?.title ?? fromPage?.title;
  const artists = fromEmbed?.artists.length ? fromEmbed.artists : fromPage?.artists;
  if (!title || !artists?.length) {
    const reason = embed.status === "rejected" ? embed.reason : page.status === "rejected" ? page.reason : null;
    if (reason instanceof UserError) throw reason;
    throw new UserError("Couldn't read that song from Spotify. Check the link, or try its YouTube link instead.", 502);
  }

  return {
    id: trackId,
    title,
    artists,
    album: fromPage?.album ?? null,
    durationSec: fromEmbed?.durationSec ?? fromPage?.durationSec ?? 0,
    artworkUrl: fromEmbed?.artworkUrl ?? fromPage?.artworkUrl ?? null,
  };
}

/** Follows a spotify.link / spoti.fi short link to the track it points at. */
export async function resolveSpotifyShortLink(url: string, fetchImpl: Fetch = fetch): Promise<string> {
  const res = await fetchImpl(url, { headers: REQUEST_HEADERS, redirect: "follow", signal: AbortSignal.timeout(10_000) });
  const candidates = [res.url, await res.text()];
  for (const text of candidates) {
    const match = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})/i.exec(text);
    if (match) return match[1];
  }
  // Short links can also point at albums or playlists; let parseLink explain.
  if (/open\.spotify\.com\//.test(res.url)) {
    const parsed = parseLink(res.url);
    if (parsed.kind === "spotify") return parsed.trackId;
  }
  throw new UserError("Couldn't follow that Spotify short link. Try the full open.spotify.com link.");
}

type PartialTrack = Omit<SpotifyTrack, "id" | "album"> & { album: string | null };

/** Reads the track entity from the embed page's Next.js data blob. */
export function parseEmbedPage(html: string): PartialTrack | null {
  const match = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!match) return null;
  let entity: EmbedEntity | undefined;
  try {
    entity = JSON.parse(match[1])?.props?.pageProps?.state?.data?.entity;
  } catch {
    return null;
  }
  if (!entity || entity.type !== "track" || !entity.name) return null;

  const images = entity.visualIdentity?.image ?? [];
  const largest = [...images].sort((a, b) => (b.maxWidth ?? 0) - (a.maxWidth ?? 0))[0];
  return {
    title: entity.title ?? entity.name,
    artists: (entity.artists ?? []).map((a) => a.name).filter((name): name is string => Boolean(name)),
    album: null,
    durationSec: typeof entity.duration === "number" ? Math.round(entity.duration / 1000) : 0,
    artworkUrl: largest?.url ?? null,
  };
}

interface EmbedEntity {
  type?: string;
  name?: string;
  title?: string;
  duration?: number;
  artists?: { name?: string }[];
  visualIdentity?: { image?: { url: string; maxWidth?: number }[] };
}

/** Reads the Open Graph and music meta tags from the public track page. */
export function parseTrackPage(html: string): PartialTrack | null {
  const meta = readMetaTags(html);
  const title = meta.get("og:title")?.[0];
  if (!title) return null;

  // og:description reads "Artist · Album · Song · Year".
  const description = (meta.get("og:description")?.[0] ?? "").split(" · ");
  const songIndex = description.lastIndexOf("Song");
  const album = songIndex >= 2 ? description[songIndex - 1] : null;
  // Artists arrive comma-joined, which can split a name like "Tyler, The Creator";
  // the embed page's structured list is preferred whenever it loads.
  const artists = (meta.get("music:musician_description")?.[0] ?? (songIndex >= 2 ? description[0] : ""))
    .split(", ")
    .filter(Boolean);
  const duration = Number(meta.get("music:duration")?.[0]);

  return {
    title,
    artists,
    album,
    durationSec: Number.isFinite(duration) ? duration : 0,
    artworkUrl: meta.get("og:image")?.[0] ?? null,
  };
}

function readMetaTags(html: string): Map<string, string[]> {
  const tags = new Map<string, string[]>();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = /\b(?:property|name)="([^"]+)"/i.exec(tag)?.[1];
    const content = /\bcontent="([^"]*)"/i.exec(tag)?.[1];
    if (!key || content === undefined) continue;
    const values = tags.get(key) ?? [];
    values.push(decodeEntities(content));
    tags.set(key, values);
  }
  return tags;
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[lower] ?? match;
  });
}

async function getText(url: string, fetchImpl: Fetch): Promise<string> {
  const res = await fetchImpl(url, { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) throw new UserError("Spotify doesn't have a song at that link.", 404);
  if (!res.ok) throw new Error(`Spotify returned HTTP ${res.status} for ${url}`);
  return res.text();
}
