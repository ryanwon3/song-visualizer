import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { UserError } from "./errors.ts";
import { youtubeWatchUrl } from "./links.ts";
import type { SearchResult } from "./match.ts";

/** What yt-dlp reports about a video, trimmed to the fields the app uses. */
export interface VideoInfo {
  id: string;
  title: string;
  channel: string | null;
  durationSec: number;
  thumbnail: string | null;
  /** Set on YouTube Music uploads, which carry proper song metadata. */
  track: string | null;
  artists: string[];
  album: string | null;
}

export interface YouTubeClient {
  search(query: string, limit: number): Promise<SearchResult[]>;
  /** Downloads the video's best audio-only stream into `audioDir` as `<id>.<ext>`. */
  downloadAudio(videoId: string, audioDir: string): Promise<{ filePath: string; info: VideoInfo }>;
}

export interface YtDlpOptions {
  /** Path to the yt-dlp executable. Defaults to bin/yt-dlp, then yt-dlp on PATH. */
  binary?: string;
  maxDurationSec: number;
}

export const ROOT_DIR = path.resolve(import.meta.dirname, "..");
export const LOCAL_YT_DLP = path.join(ROOT_DIR, "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

export function findYtDlp(): string {
  if (process.env.YT_DLP_PATH) return process.env.YT_DLP_PATH;
  return existsSync(LOCAL_YT_DLP) ? LOCAL_YT_DLP : "yt-dlp";
}

const INFO_FIELDS = "id,title,channel,uploader,duration,thumbnail,track,artist,artists,album,is_live";

export function createYtDlpClient(options: YtDlpOptions): YouTubeClient {
  const binary = options.binary ?? findYtDlp();
  const baseArgs = [
    "--encoding",
    "utf-8",
    "--no-progress",
    // Recent YouTube changes need a JavaScript runtime; Node is already here.
    "--js-runtimes",
    `node:${process.execPath}`,
    "--remote-components",
    "ejs:github",
  ];

  return {
    async search(query, limit) {
      const stdout = await runYtDlp(binary, [...baseArgs, "--flat-playlist", "--dump-single-json", `ytsearch${limit}:${query}`], 60_000);
      const data = JSON.parse(stdout) as { entries?: RawSearchEntry[] };
      return (data.entries ?? [])
        .filter((entry) => entry.id && entry.title)
        .map((entry) => ({
          id: entry.id,
          title: entry.title,
          channel: entry.channel ?? entry.uploader ?? null,
          durationSec: typeof entry.duration === "number" ? Math.round(entry.duration) : null,
        }));
    },

    async downloadAudio(videoId, audioDir) {
      // Download into a scratch folder so a half-finished file never looks cached.
      const scratch = await mkdtemp(path.join(audioDir, `.${videoId}-`));
      try {
        const stdout = await runYtDlp(
          binary,
          [
            ...baseArgs,
            "--no-playlist",
            "--no-simulate",
            "--format",
            // m4a (AAC) plays in every browser, Safari included.
            "bestaudio[ext=m4a]/bestaudio/best",
            "--match-filter",
            `!is_live & duration <=? ${options.maxDurationSec}`,
            "--output",
            path.join(scratch.replaceAll("%", "%%"), `${videoId}.%(ext)s`),
            "--print",
            `video:%(.{${INFO_FIELDS}})j`,
            "--print",
            "after_move:filepath",
            "--",
            youtubeWatchUrl(videoId),
          ],
          180_000,
        );

        const lines = stdout.split(/\r?\n/).filter(Boolean);
        const info = lines.find((line) => line.startsWith("{"));
        const raw = info ? (JSON.parse(info) as RawVideoInfo) : null;
        const downloaded = lines.find((line) => !line.startsWith("{"));
        if (!raw || !downloaded) {
          if (raw?.is_live) throw new UserError("That's a live stream. Paste a link to a regular video.");
          if (!raw || (raw.duration ?? 0) > options.maxDurationSec) {
            throw new UserError(`That video is over ${Math.round(options.maxDurationSec / 60)} minutes long. Paste a link to a single song.`);
          }
          throw new Error(`yt-dlp finished without a file for ${videoId}`);
        }

        const fileName = (await readdir(scratch)).find((name) => name.startsWith(`${videoId}.`)) ?? path.basename(downloaded);
        const filePath = path.join(audioDir, fileName);
        await rename(path.join(scratch, fileName), filePath);
        return { filePath, info: toVideoInfo(raw, videoId) };
      } finally {
        await rm(scratch, { recursive: true, force: true });
      }
    },
  };
}

interface RawSearchEntry {
  id: string;
  title: string;
  channel?: string;
  uploader?: string;
  duration?: number;
}

interface RawVideoInfo {
  id?: string;
  title?: string;
  channel?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  track?: string;
  artist?: string;
  artists?: string[];
  album?: string;
  is_live?: boolean;
}

function toVideoInfo(raw: RawVideoInfo, videoId: string): VideoInfo {
  const artists = raw.artists?.length ? raw.artists : raw.artist ? raw.artist.split(/,\s*/) : [];
  return {
    id: raw.id ?? videoId,
    title: raw.title ?? videoId,
    channel: raw.channel ?? raw.uploader ?? null,
    durationSec: Math.round(raw.duration ?? 0),
    thumbnail: raw.thumbnail ?? null,
    track: raw.track ?? null,
    artists,
    album: raw.album ?? null,
  };
}

function runYtDlp(binary: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      windowsHide: true,
      timeout: timeoutMs,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(
        error.code === "ENOENT"
          ? new UserError("yt-dlp isn't installed on the server. Run `npm run setup` and try again.", 500)
          : error,
      );
    });
    child.on("close", (code, signal) => {
      if (code === 0) return resolve(stdout);
      if (signal) return reject(new Error(`yt-dlp was stopped (${signal}) after ${timeoutMs / 1000}s`));
      reject(explainFailure(stderr) ?? new Error(`yt-dlp exited with code ${code}: ${stderr.trim().slice(-2000)}`));
    });
  });
}

/** Maps yt-dlp's error output to a message worth showing the user. */
export function explainFailure(stderr: string): UserError | null {
  if (/Private video|Video unavailable|This video is unavailable|has been removed|does not exist/i.test(stderr)) {
    return new UserError("That YouTube video is private or no longer available.", 404);
  }
  if (/confirm your age|age.restricted|inappropriate for some users/i.test(stderr)) {
    return new UserError("That video is age-restricted, so YouTube won't hand over its audio. Try another upload of the song.", 422);
  }
  if (/not available in your country|blocked it in your country|geo.?restrict/i.test(stderr)) {
    return new UserError("That video isn't available in this server's country. Try another upload of the song.", 422);
  }
  if (/not a bot|HTTP Error 429|HTTP Error 403|Requested format is not available|page needs to be reloaded/i.test(stderr)) {
    return new UserError(
      "YouTube is refusing downloads from this server right now. Updating yt-dlp (npm run setup) often fixes it; otherwise try again later.",
      503,
    );
  }
  return null;
}
