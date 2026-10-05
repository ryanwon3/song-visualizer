# Song Visualizer

Paste a YouTube or Spotify link and the song plays in the page, ready to be
visualized. This is the first piece of a bigger plan: lyrics with emotion
colors, bass/mids/treble effect layers, and MP4 export come next.

## Run it

You need [Node.js](https://nodejs.org/) 20.19 or newer (Node 24 LTS works).

```sh
npm install
npm run dev
```

Then open http://localhost:3000.

The first `npm run dev` downloads [yt-dlp](https://github.com/yt-dlp/yt-dlp)
into `bin/` (about 40 MB). That's the tool that pulls audio from YouTube. If
YouTube downloads start failing, run `npm run setup` to update it: YouTube
changes often and yt-dlp keeps up.

## How links become audio

- **YouTube** (`youtube.com/watch`, `youtu.be`, `music.youtube.com`, Shorts):
  the server downloads the video's audio-only stream with yt-dlp. The title and
  artist come from YouTube Music metadata when the video has it, otherwise from
  the video title (`Artist - Song (Official Video)` becomes `Song` by `Artist`).
- **Spotify** (`open.spotify.com/track/…`, `spotify:track:…`, `spotify.link`):
  Spotify doesn't hand out audio, so the server reads the track's title,
  artists, album and length from Spotify's public pages (no API key), searches
  YouTube for it, and picks the upload whose length and title match best. The
  artist's own uploads and studio audio win over live, cover and sped-up
  versions, which keeps lyric timings lined up later.

Audio is cached in `.cache/`, so a song only downloads once. Videos longer
than 15 minutes and live streams are turned away.

Links can be shared: the page keeps the song in its address, like
`http://localhost:3000/?url=https://youtu.be/dQw4w9WgXcQ`.

## For the next pieces

`POST /api/songs` with `{ "url": "<link>" }` returns a `Song`
(see [`shared/song.ts`](shared/song.ts)):

```json
{
  "id": "dQw4w9WgXcQ",
  "title": "Never Gonna Give You Up",
  "artists": ["Rick Astley"],
  "artist": "Rick Astley",
  "album": "Whenever You Need Somebody",
  "durationSec": 214,
  "artworkUrl": "https://i.scdn.co/image/…",
  "source": "spotify",
  "sourceUrl": "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
  "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "audioUrl": "/api/audio/dQw4w9WgXcQ"
}
```

- `title`, `artists`, `album` and `durationSec` describe the song itself (from
  Spotify when the link was a Spotify one) and are what lyrics lookups should use.
- `audioUrl` is same-origin and supports range requests, so the `<audio>`
  element can seek and the Web Audio API can analyse it without CORS trouble.
- The page fires a `songchange` event on `document` with the `Song` as
  `detail` whenever a new song loads.

## Settings

All optional, as environment variables:

| Variable           | Default        | What it does                              |
| ------------------ | -------------- | ----------------------------------------- |
| `PORT`             | `3000`         | Port the app listens on                   |
| `CACHE_DIR`        | `.cache`       | Where downloaded audio and song info live |
| `MAX_SONG_MINUTES` | `15`           | Longest video the app will download       |
| `YT_DLP_PATH`      | `bin/yt-dlp`   | Use a yt-dlp installed somewhere else     |

## Other commands

```sh
npm test           # unit and API tests
npm run typecheck  # TypeScript, front end and server
npm run build      # build the front end into dist/
npm start          # serve dist/ and the API (production mode)
```

## Layout

```
server/   Express API: link parsing, Spotify lookup, YouTube search and download
web/      Vite + TypeScript front end
shared/   Types used by both
scripts/  yt-dlp downloader
test/     Vitest tests
```

## Good to know

YouTube blocks downloads from most cloud servers, so this runs best on your own
computer. Hosting it for friends is its own step later in the plan.
