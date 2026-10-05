import type { ApiError, Song } from "../../shared/song.ts";

/** Asks the server to resolve a YouTube or Spotify link and fetch its audio. */
export async function loadSong(url: string, signal?: AbortSignal): Promise<Song> {
  let res: Response;
  try {
    res = await fetch("/api/songs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("Couldn't reach the server. Is it still running?");
  }

  const body = (await res.json().catch(() => null)) as Song | ApiError | null;
  if (!res.ok || !body || "error" in body) {
    throw new Error(body && "error" in body ? body.error : `The server returned an error (${res.status}).`);
  }
  return body;
}
