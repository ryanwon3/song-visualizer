import { describe, expect, it } from "vitest";
import { fetchSpotifyTrack, parseEmbedPage, parseTrackPage, resolveSpotifyShortLink } from "../server/spotify.ts";
import { embedHtml, getLuckyEntity, trackPageHtml } from "./fixtures/spotify.ts";

describe("parseEmbedPage", () => {
  it("reads title, artists, length and the largest artwork", () => {
    expect(parseEmbedPage(embedHtml(getLuckyEntity))).toEqual({
      title: "Get Lucky (Radio Edit) [feat. Pharrell Williams and Nile Rodgers]",
      artists: ["Daft Punk", "Pharrell Williams", "Nile Rodgers"],
      album: null,
      durationSec: 248,
      artworkUrl: "https://image-cdn-ak.spotifycdn.com/image/ab67616d0000b273",
    });
  });

  it("ignores pages without track data", () => {
    expect(parseEmbedPage("<html></html>")).toBeNull();
    expect(parseEmbedPage(embedHtml({ type: "album", name: "Jazz" }))).toBeNull();
  });
});

describe("parseTrackPage", () => {
  it("reads the Open Graph tags, album included", () => {
    expect(parseTrackPage(trackPageHtml)).toEqual({
      title: "Don't Stop Me Now - Remastered 2011",
      artists: ["Queen"],
      album: "Jazz (2011 Remaster)",
      durationSec: 209,
      artworkUrl: "https://i.scdn.co/image/ab67616d0000b273",
    });
  });
});

describe("fetchSpotifyTrack", () => {
  const fakeFetch = (pages: Record<string, { status?: number; body: string }>) =>
    (async (input: string | URL | Request) => {
      const url = String(input);
      const page = pages[url];
      return new Response(page?.body ?? "not found", { status: page ? (page.status ?? 200) : 404 });
    }) as typeof fetch;

  it("combines the embed page with the album from the track page", async () => {
    const track = await fetchSpotifyTrack(
      "2Foc5Q5nqNiosCNqttzHof",
      fakeFetch({
        "https://open.spotify.com/embed/track/2Foc5Q5nqNiosCNqttzHof": { body: embedHtml(getLuckyEntity) },
        "https://open.spotify.com/track/2Foc5Q5nqNiosCNqttzHof": {
          body: trackPageHtml.replace("Jazz (2011 Remaster)", "Random Access Memories"),
        },
      }),
    );
    expect(track).toMatchObject({
      id: "2Foc5Q5nqNiosCNqttzHof",
      title: "Get Lucky (Radio Edit) [feat. Pharrell Williams and Nile Rodgers]",
      artists: ["Daft Punk", "Pharrell Williams", "Nile Rodgers"],
      album: "Random Access Memories",
      durationSec: 248,
    });
  });

  it("falls back to the track page when the embed page fails", async () => {
    const track = await fetchSpotifyTrack(
      "7hQJA50XrCWABAu5v6QZ4i",
      fakeFetch({
        "https://open.spotify.com/embed/track/7hQJA50XrCWABAu5v6QZ4i": { status: 500, body: "oops" },
        "https://open.spotify.com/track/7hQJA50XrCWABAu5v6QZ4i": { body: trackPageHtml },
      }),
    );
    expect(track).toMatchObject({ title: "Don't Stop Me Now - Remastered 2011", artists: ["Queen"], album: "Jazz (2011 Remaster)" });
  });

  it("says when the track doesn't exist", async () => {
    await expect(fetchSpotifyTrack("0000000000000000000000", fakeFetch({}))).rejects.toThrow("Spotify doesn't have a song at that link.");
  });
});

describe("resolveSpotifyShortLink", () => {
  it("finds the track a short link redirects to", async () => {
    const fetchImpl = (async () => {
      const res = new Response('<a href="https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x">Open</a>');
      return res;
    }) as typeof fetch;
    await expect(resolveSpotifyShortLink("https://spotify.link/abc", fetchImpl)).resolves.toBe("4uLU6hMCjMI75M1A2tKUQC");
  });
});
