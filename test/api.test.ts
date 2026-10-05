import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Song } from "../shared/song.ts";
import { createApp } from "../server/app.ts";
import { UserError } from "../server/errors.ts";
import { createSongService } from "../server/songs.ts";
import type { VideoInfo, YouTubeClient } from "../server/youtube.ts";
import { embedHtml, getLuckyEntity, trackPageHtml } from "./fixtures/spotify.ts";

const AUDIO_BYTES = Buffer.from("fake m4a audio bytes, long enough to ask for a range of");

class FakeYouTube implements YouTubeClient {
  downloads: string[] = [];
  searches: string[] = [];
  videos = new Map<string, VideoInfo>();

  async search(query: string) {
    this.searches.push(query);
    return [
      { id: "lyricsVid01", title: "Daft Punk - Get Lucky (Lyrics)", channel: "7clouds", durationSec: 246 },
      { id: "officialA01", title: "Daft Punk - Get Lucky (Official Audio)", channel: "Daft Punk", durationSec: 249 },
    ];
  }

  async downloadAudio(videoId: string, audioDir: string) {
    this.downloads.push(videoId);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const info = this.videos.get(videoId);
    if (!info) throw new UserError("That YouTube video is private or no longer available.", 404);
    const filePath = path.join(audioDir, `${videoId}.m4a`);
    await writeFile(filePath, AUDIO_BYTES);
    return { filePath, info };
  }
}

const spotifyFetch = (async (input: string | URL | Request) => {
  const url = String(input);
  if (url.endsWith("/embed/track/2Foc5Q5nqNiosCNqttzHof")) return new Response(embedHtml(getLuckyEntity));
  if (url.endsWith("/track/2Foc5Q5nqNiosCNqttzHof")) return new Response(trackPageHtml.replace("Jazz (2011 Remaster)", "Random Access Memories"));
  return new Response("not found", { status: 404 });
}) as typeof fetch;

let cacheDir: string;
let server: Server;
let baseUrl: string;
let youtube: FakeYouTube;

beforeEach(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), "song-visualizer-test-"));
  youtube = new FakeYouTube();
  youtube.videos.set("dQw4w9WgXcQ", {
    id: "dQw4w9WgXcQ",
    title: "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
    channel: "Rick Astley",
    durationSec: 213,
    thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
    track: null,
    artists: [],
    album: null,
  });
  youtube.videos.set("officialA01", {
    id: "officialA01",
    title: "Daft Punk - Get Lucky (Official Audio)",
    channel: "Daft Punk",
    durationSec: 249,
    thumbnail: null,
    track: null,
    artists: [],
    album: null,
  });
  const songs = createSongService({ cacheDir, youtube, fetch: spotifyFetch });
  server = createApp(songs).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(cacheDir, { recursive: true, force: true });
});

function postSong(url: unknown) {
  return fetch(`${baseUrl}/api/songs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

describe("POST /api/songs", () => {
  it("loads a YouTube link and names the song from the video title", async () => {
    const res = await postSong("https://youtu.be/dQw4w9WgXcQ?si=share");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: "dQw4w9WgXcQ",
      title: "Never Gonna Give You Up",
      artists: ["Rick Astley"],
      artist: "Rick Astley",
      album: null,
      durationSec: 213,
      artworkUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
      source: "youtube",
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      audioUrl: "/api/audio/dQw4w9WgXcQ",
    } satisfies Song);
  });

  it("loads a Spotify link by finding the same recording on YouTube", async () => {
    const res = await postSong("https://open.spotify.com/track/2Foc5Q5nqNiosCNqttzHof?si=abc");
    expect(res.status).toBe(200);
    const song = (await res.json()) as Song;
    expect(song).toMatchObject({
      id: "officialA01",
      title: "Get Lucky (Radio Edit) [feat. Pharrell Williams and Nile Rodgers]",
      artists: ["Daft Punk", "Pharrell Williams", "Nile Rodgers"],
      artist: "Daft Punk, Pharrell Williams, Nile Rodgers",
      album: "Random Access Memories",
      durationSec: 248,
      source: "spotify",
      sourceUrl: "https://open.spotify.com/track/2Foc5Q5nqNiosCNqttzHof",
      audioUrl: "/api/audio/officialA01",
    });
    expect(youtube.searches).toEqual(["Daft Punk - Get Lucky"]);
  });

  it("downloads each song once, even when asked for twice at the same time", async () => {
    const link = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const responses = await Promise.all([postSong(link), postSong(link)]);
    expect(responses.map((res) => res.status)).toEqual([200, 200]);
    expect((await postSong(link)).status).toBe(200);
    expect(youtube.downloads).toEqual(["dQw4w9WgXcQ"]);
  });

  it.each([
    ["https://soundcloud.com/someone/song", 400, /Only YouTube and Spotify/],
    ["https://open.spotify.com/album/6N9PS4QXF1D0OWPk0Sxtb4", 400, /Spotify album/],
    ["https://open.spotify.com/track/0000000000000000000000", 404, /Spotify doesn't have a song/],
    ["https://youtu.be/xxxxxxxxxxx", 404, /private or no longer available/],
    [42, 400, /Send a JSON body/],
  ])("explains what went wrong with %j", async (url, status, message) => {
    const res = await postSong(url);
    expect(res.status).toBe(status);
    expect(((await res.json()) as { error: string }).error).toMatch(message);
  });
});

describe("GET /api/audio/:id", () => {
  it("streams cached audio and supports seeking", async () => {
    await postSong("https://youtu.be/dQw4w9WgXcQ");

    const full = await fetch(`${baseUrl}/api/audio/dQw4w9WgXcQ`);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("audio/mp4");
    expect(Buffer.from(await full.arrayBuffer())).toEqual(AUDIO_BYTES);

    const partial = await fetch(`${baseUrl}/api/audio/dQw4w9WgXcQ`, { headers: { range: "bytes=5-8" } });
    expect(partial.status).toBe(206);
    expect(await partial.text()).toBe("m4a ");
  });

  it("404s for songs that haven't been loaded or ids that aren't video ids", async () => {
    expect((await fetch(`${baseUrl}/api/audio/dQw4w9WgXcQ`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/audio/..%2F..%2Fetc`)).status).toBe(404);
  });
});
