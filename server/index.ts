import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { createApp } from "./app.ts";
import { createSongService } from "./songs.ts";
import { createYtDlpClient, findYtDlp, ROOT_DIR } from "./youtube.ts";

const production = process.env.NODE_ENV === "production" || process.argv.includes("--production");
const port = Number(process.env.PORT) || 3000;
const cacheDir = path.resolve(process.env.CACHE_DIR ?? path.join(ROOT_DIR, ".cache"));
const maxMinutes = Number(process.env.MAX_SONG_MINUTES) || 15;

const songs = createSongService({
  cacheDir,
  youtube: createYtDlpClient({ maxDurationSec: maxMinutes * 60 }),
});
const app = createApp(songs);

if (production) {
  const dist = path.join(ROOT_DIR, "dist");
  if (!existsSync(path.join(dist, "index.html"))) {
    console.error("No front-end build found. Run `npm run build` first.");
    process.exit(1);
  }
  app.use(express.static(dist, { index: "index.html" }));
  app.get("/{*path}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  // In development Vite serves the front end from this same port, with hot reload.
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: path.join(ROOT_DIR, "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.listen(port, () => {
  console.log(`Song Visualizer running at http://localhost:${port}`);
  console.log(`  yt-dlp: ${findYtDlp()}`);
  console.log(`  cache:  ${cacheDir}`);
});
