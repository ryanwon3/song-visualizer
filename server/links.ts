import { UserError } from "./errors.ts";

export type ParsedLink =
  | { kind: "youtube"; videoId: string }
  | { kind: "spotify"; trackId: string }
  | { kind: "spotify-short"; url: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const SPOTIFY_SHORT_HOSTS = new Set(["spotify.link", "spoti.fi"]);

export function isYouTubeId(value: string): boolean {
  return YOUTUBE_ID.test(value);
}

export function isSpotifyId(value: string): boolean {
  return SPOTIFY_ID.test(value);
}

/**
 * Works out what a pasted link points at. Accepts the usual YouTube and
 * Spotify URL shapes, with or without the scheme, plus `spotify:track:` URIs.
 */
export function parseLink(input: string): ParsedLink {
  const text = input.trim();
  if (!text) throw new UserError("Paste a YouTube or Spotify link.");

  const uri = /^spotify:(\w+):([A-Za-z0-9]+)$/.exec(text);
  if (uri) return spotifyLink(uri[1], uri[2]);

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new UserError("That doesn't look like a link. Paste a YouTube or Spotify song link.");
  }
  const host = url.hostname.toLowerCase();

  if (host === "youtu.be") {
    return youtubeLink(url.pathname.split("/")[1]);
  }
  if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === "/watch") return youtubeLink(url.searchParams.get("v"));
    const [, section, id] = url.pathname.split("/");
    if (["shorts", "embed", "live", "v"].includes(section)) return youtubeLink(id);
    if (section === "playlist") {
      throw new UserError("That's a YouTube playlist. Paste a link to a single video.");
    }
    throw new UserError("Couldn't find a video in that YouTube link.");
  }

  if (host === "open.spotify.com" || host === "play.spotify.com") {
    // Locale-prefixed links look like /intl-de/track/<id>.
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0]?.startsWith("intl-")) parts.shift();
    return spotifyLink(parts[0], parts[1]);
  }
  if (SPOTIFY_SHORT_HOSTS.has(host)) {
    return { kind: "spotify-short", url: url.toString() };
  }

  throw new UserError("Only YouTube and Spotify links are supported.");
}

function youtubeLink(id: string | null | undefined): ParsedLink {
  if (!id || !YOUTUBE_ID.test(id)) {
    throw new UserError("Couldn't find a video in that YouTube link.");
  }
  return { kind: "youtube", videoId: id };
}

function spotifyLink(type: string | undefined, id: string | undefined): ParsedLink {
  if (type !== "track") {
    throw new UserError(
      type && ["album", "playlist", "artist", "episode", "show"].includes(type)
        ? `That's a Spotify ${type}. Paste a link to a single song.`
        : "Couldn't find a song in that Spotify link.",
    );
  }
  if (!id || !SPOTIFY_ID.test(id)) {
    throw new UserError("Couldn't find a song in that Spotify link.");
  }
  return { kind: "spotify", trackId: id };
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function spotifyTrackUrl(trackId: string): string {
  return `https://open.spotify.com/track/${trackId}`;
}
