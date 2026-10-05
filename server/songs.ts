import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Song } from "../shared/song.ts";
import { UserError } from "./errors.ts";
import { isYouTubeId, parseLink, spotifyTrackUrl, youtubeWatchUrl } from "./links.ts";
import { coreTitle, pickBestMatch } from "./match.ts";
import { fetchSpotifyTrack, resolveSpotifyShortLink, type SpotifyTrack } from "./spotify.ts";
import { parseVideoTitle } from "./titles.ts";
import type { VideoInfo, YouTubeClient } from "./youtube.ts";

export interface SongServiceOptions {
  cacheDir: string;
  youtube: YouTubeClient;
  fetch?: typeof fetch;
}

export interface SongService {
  /** Resolves a pasted link to a song whose audio is downloaded and cached. */
  resolve(link: string): Promise<Song>;
  /** Absolute path of the cached audio for a YouTube video id, if there is one. */
  audioFile(videoId: string): Promise<string | null>;
}

interface CachedAudio {
  fileName: string;
  info: VideoInfo;
}

const SEARCH_RESULTS = 8;

export function createSongService(options: SongServiceOptions): SongService {
  const audioDir = path.join(options.cacheDir, "audio");
  const songDir = path.join(options.cacheDir, "songs");
  const fetchImpl = options.fetch ?? fetch;
  const ready = Promise.all([mkdir(audioDir, { recursive: true }), mkdir(songDir, { recursive: true })]);

  // Two people pasting the same song at once share one download.
  const inFlight = new Map<string, Promise<unknown>>();
  function once<T>(key: string, work: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const promise = work().finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return promise;
  }

  async function readJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch {
      return null;
    }
  }

  async function cachedAudio(videoId: string): Promise<CachedAudio | null> {
    const cached = await readJson<CachedAudio>(path.join(audioDir, `${videoId}.json`));
    return cached && existsSync(path.join(audioDir, cached.fileName)) ? cached : null;
  }

  function ensureAudio(videoId: string): Promise<CachedAudio> {
    return once(`audio:${videoId}`, async () => {
      const cached = await cachedAudio(videoId);
      if (cached) return cached;
      const { filePath, info } = await options.youtube.downloadAudio(videoId, audioDir);
      const entry: CachedAudio = { fileName: path.basename(filePath), info };
      await writeFile(path.join(audioDir, `${videoId}.json`), JSON.stringify(entry, null, 2));
      return entry;
    });
  }

  async function songFromYouTube(videoId: string): Promise<Song> {
    const { info } = await ensureAudio(videoId);
    const identity =
      info.track && info.artists.length ? { title: info.track, artists: info.artists } : parseVideoTitle(info.title, info.channel);
    return buildSong({
      videoId,
      title: identity.title,
      artists: identity.artists.length ? identity.artists : ["Unknown artist"],
      album: info.album,
      durationSec: info.durationSec,
      artworkUrl: info.thumbnail,
      source: "youtube",
      sourceUrl: youtubeWatchUrl(videoId),
    });
  }

  async function songFromSpotify(trackId: string): Promise<Song> {
    const track = await fetchSpotifyTrack(trackId, fetchImpl);
    const videoId = await findOnYouTube(track);
    const { info } = await ensureAudio(videoId);
    return buildSong({
      videoId,
      title: track.title,
      artists: track.artists,
      album: track.album,
      durationSec: track.durationSec || info.durationSec,
      artworkUrl: track.artworkUrl ?? info.thumbnail,
      source: "spotify",
      sourceUrl: spotifyTrackUrl(trackId),
    });
  }

  async function findOnYouTube(track: SpotifyTrack): Promise<string> {
    const query = `${track.artists[0]} - ${coreTitle(track.title)}`;
    const results = await options.youtube.search(query, SEARCH_RESULTS);
    const match = pickBestMatch(track, results);
    if (!match) {
      throw new UserError(`Couldn't find "${track.title}" by ${track.artists[0]} on YouTube. Try pasting a YouTube link for it instead.`, 404);
    }
    return match.id;
  }

  return {
    async resolve(link) {
      await ready;
      const parsed = parseLink(link);
      const source = parsed.kind === "youtube" ? "youtube" : "spotify";
      const id =
        parsed.kind === "youtube"
          ? parsed.videoId
          : parsed.kind === "spotify"
            ? parsed.trackId
            : await resolveSpotifyShortLink(parsed.url, fetchImpl);
      const key = `${source}-${id}`;

      return once(`song:${key}`, async () => {
        const songFile = path.join(songDir, `${key}.json`);
        const cached = await readJson<Song>(songFile);
        if (cached && (await cachedAudio(cached.id))) return cached;

        const song = source === "youtube" ? await songFromYouTube(id) : await songFromSpotify(id);
        await writeFile(songFile, JSON.stringify(song, null, 2));
        return song;
      });
    },

    async audioFile(videoId) {
      if (!isYouTubeId(videoId)) return null;
      await ready;
      const cached = await cachedAudio(videoId);
      return cached ? path.join(audioDir, cached.fileName) : null;
    },
  };
}

function buildSong(fields: Omit<Song, "id" | "artist" | "youtubeUrl" | "audioUrl"> & { videoId: string }): Song {
  const { videoId, ...rest } = fields;
  return {
    id: videoId,
    ...rest,
    artist: rest.artists.join(", "),
    youtubeUrl: youtubeWatchUrl(videoId),
    audioUrl: `/api/audio/${videoId}`,
  };
}
