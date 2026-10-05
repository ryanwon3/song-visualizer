import { describe, expect, it } from "vitest";
import { parseLink } from "../server/links.ts";

describe("parseLink", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=42",
    "youtube.com/watch?v=dQw4w9WgXcQ",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=abc",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    "  https://www.youtube.com/live/dQw4w9WgXcQ  ",
  ])("reads the video id from %s", (link) => {
    expect(parseLink(link)).toEqual({ kind: "youtube", videoId: "dQw4w9WgXcQ" });
  });

  it.each([
    "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=1c2d3e4f",
    "https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC",
    "open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    "spotify:track:4uLU6hMCjMI75M1A2tKUQC",
  ])("reads the track id from %s", (link) => {
    expect(parseLink(link)).toEqual({ kind: "spotify", trackId: "4uLU6hMCjMI75M1A2tKUQC" });
  });

  it("passes Spotify short links on to be followed", () => {
    expect(parseLink("https://spotify.link/AbCdEf123")).toEqual({ kind: "spotify-short", url: "https://spotify.link/AbCdEf123" });
  });

  it.each([
    ["", /Paste a YouTube or Spotify link/],
    ["not a link at all", /doesn't look like a link|Only YouTube and Spotify/],
    ["https://soundcloud.com/artist/song", /Only YouTube and Spotify/],
    ["https://www.youtube.com/watch?v=short", /Couldn't find a video/],
    ["https://www.youtube.com/playlist?list=PL123", /playlist/],
    ["https://www.youtube.com/@SomeChannel", /Couldn't find a video/],
    ["https://open.spotify.com/album/6N9PS4QXF1D0OWPk0Sxtb4", /Spotify album/],
    ["https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", /Spotify playlist/],
    ["spotify:artist:0gxyHStUsqpMadRV0Di1Qt", /Spotify artist/],
    ["https://open.spotify.com/track/tooShort", /Couldn't find a song/],
  ])("rejects %j with a helpful message", (link, message) => {
    expect(() => parseLink(link)).toThrow(message);
  });
});
