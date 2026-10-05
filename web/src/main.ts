import type { Song } from "../../shared/song.ts";
import { loadSong } from "./api.ts";
import "./styles.css";

const form = element<HTMLFormElement>("link-form");
const input = element<HTMLInputElement>("link-input");
const button = element<HTMLButtonElement>("load-button");
const status = element<HTMLParagraphElement>("status");
const songPanel = element<HTMLElement>("song");
const player = element<HTMLAudioElement>("player");

let currentSong: Song | null = null;
let pending: AbortController | null = null;

// Show the empty artwork square rather than a broken-image icon.
const artwork = element<HTMLImageElement>("song-artwork");
artwork.addEventListener("error", () => (artwork.hidden = true));
artwork.addEventListener("load", () => (artwork.hidden = false));

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void load(input.value);
});

// Links shared as ?url=… load straight away.
const shared = new URLSearchParams(location.search).get("url");
if (shared) {
  input.value = shared;
  void load(shared);
}

async function load(link: string): Promise<void> {
  const url = link.trim();
  if (!url) return;

  pending?.abort();
  const request = new AbortController();
  pending = request;
  setBusy(true);
  showStatus("Finding the song…");
  // The first load of a song downloads its audio, which takes a few seconds.
  const slow = window.setTimeout(() => showStatus("Downloading the audio. The first load of a song takes a little while…"), 3500);

  try {
    const song = await loadSong(url, request.signal);
    showSong(song);
    showStatus("");
    history.replaceState(null, "", `?url=${encodeURIComponent(url)}`);
  } catch (error) {
    if (request.signal.aborted) return;
    showStatus(error instanceof Error ? error.message : String(error), "error");
  } finally {
    window.clearTimeout(slow);
    if (pending === request) {
      pending = null;
      setBusy(false);
    }
  }
}

function showSong(song: Song): void {
  const changed = song.audioUrl !== currentSong?.audioUrl;
  currentSong = song;
  document.title = `${song.title} · ${song.artist} · Song Visualizer`;

  element("song-title").textContent = song.title;
  element("song-artist").textContent = song.artist;
  // Singles are often their own album; skip the repeat.
  const album = element("song-album");
  album.textContent = song.album ?? "";
  album.hidden = !song.album || song.album === song.title;

  artwork.hidden = true;
  if (song.artworkUrl) artwork.src = song.artworkUrl;

  const source = element<HTMLAnchorElement>("song-source");
  source.href = song.sourceUrl;
  source.textContent = song.source === "spotify" ? "Open in Spotify" : "Open on YouTube";
  const youtube = element<HTMLAnchorElement>("song-youtube");
  youtube.href = song.youtubeUrl;
  youtube.hidden = song.source === "youtube";

  songPanel.hidden = false;
  if (changed) {
    player.src = song.audioUrl;
    player.play().catch(() => {
      // Autoplay can be blocked until the page has been interacted with.
    });
  }
  document.dispatchEvent(new CustomEvent<Song>("songchange", { detail: song }));
}

function setBusy(busy: boolean): void {
  button.disabled = busy;
  form.classList.toggle("busy", busy);
}

function showStatus(message: string, tone: "info" | "error" = "info"): void {
  status.textContent = message;
  status.dataset.tone = tone;
}

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing #${id} in index.html`);
  return found as T;
}
