import express, { type ErrorRequestHandler } from "express";
import path from "node:path";
import { UserError } from "./errors.ts";
import type { SongService } from "./songs.ts";

const AUDIO_TYPES: Record<string, string> = {
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".webm": "audio/webm",
  ".opus": "audio/ogg",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
};

/** The JSON API. Front-end serving is added on top in index.ts. */
export function createApp(songs: SongService): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", express.json({ limit: "10kb" }));

  app.post("/api/songs", async (req, res) => {
    const url: unknown = req.body?.url;
    if (typeof url !== "string") throw new UserError("Send a JSON body like { \"url\": \"https://youtu.be/...\" }.");
    const started = Date.now();
    const song = await songs.resolve(url);
    console.log(`Resolved ${url} → ${song.artist} - ${song.title} [${song.id}] in ${Date.now() - started}ms`);
    res.json(song);
  });

  app.get("/api/audio/:id", async (req, res) => {
    const file = await songs.audioFile(req.params.id);
    if (!file) throw new UserError("No audio for that song yet. Load it from a link first.", 404);
    const type = AUDIO_TYPES[path.extname(file).toLowerCase()];
    if (type) res.type(type);
    // sendFile handles Range requests, so the player can seek.
    res.sendFile(file, { maxAge: "7d", immutable: true });
  });

  app.use("/api", (_req, _res, next) => next(new UserError("Not found.", 404)));

  const handleError: ErrorRequestHandler = (error, req, res, _next) => {
    if (error instanceof UserError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error?.type === "entity.parse.failed") {
      res.status(400).json({ error: "The request body isn't valid JSON." });
      return;
    }
    console.error(`${req.method} ${req.originalUrl} failed:`, error);
    res.status(500).json({ error: "Something went wrong getting that song. Try again, or try a different link." });
  };
  app.use(handleError);

  return app;
}
