/**
 * A song the app has resolved and downloaded. The server returns this from
 * POST /api/songs and the browser keeps it alongside the audio element.
 *
 * Audio always comes from YouTube, so `id` is a YouTube video id even when the
 * user pasted a Spotify link. Title, artists, album and duration describe the
 * song itself (taken from Spotify when available) and are what lyrics lookups
 * should use.
 */
export interface Song {
  /** YouTube video id the audio was taken from. */
  id: string;
  title: string;
  /** Every credited artist, primary artist first. */
  artists: string[];
  /** Artists joined for display, e.g. "Daft Punk, Pharrell Williams". */
  artist: string;
  album: string | null;
  durationSec: number;
  artworkUrl: string | null;
  /** Which kind of link the user pasted. */
  source: SongSource;
  /** Canonical form of the link the user pasted. */
  sourceUrl: string;
  /** Watch page of the YouTube video the audio came from. */
  youtubeUrl: string;
  /** Same-origin URL that streams the cached audio file. */
  audioUrl: string;
}

export type SongSource = "youtube" | "spotify";

export interface ApiError {
  error: string;
}
