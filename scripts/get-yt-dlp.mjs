// Downloads the latest standalone yt-dlp build for this computer into bin/.
// The server uses it to pull audio from YouTube. Run `npm run setup` again
// whenever YouTube downloads start failing: yt-dlp updates often to keep up.
//
//   node scripts/get-yt-dlp.mjs              download (or update) yt-dlp
//   node scripts/get-yt-dlp.mjs --if-missing only download when bin/ has none

import { existsSync } from "node:fs";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ASSETS = {
  win32: { x64: "yt-dlp.exe", arm64: "yt-dlp_arm64.exe", ia32: "yt-dlp_x86.exe" },
  darwin: { x64: "yt-dlp_macos", arm64: "yt-dlp_macos" },
  linux: { x64: "yt-dlp_linux", arm64: "yt-dlp_linux_aarch64" },
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
const ifMissing = process.argv.includes("--if-missing");

if (ifMissing && (process.env.YT_DLP_PATH || existsSync(target))) process.exit(0);

const asset = ASSETS[process.platform]?.[process.arch];
if (!asset) {
  finish(`No standalone yt-dlp build for ${process.platform}/${process.arch}. Install yt-dlp yourself and set YT_DLP_PATH.`);
} else {
  try {
    const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`;
    console.log(`Downloading yt-dlp (${asset})…`);
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`GitHub returned HTTP ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());

    await mkdir(path.dirname(target), { recursive: true });
    const partial = `${target}.download`;
    await writeFile(partial, body);
    await chmod(partial, 0o755);
    await rename(partial, target);
    console.log(`Saved yt-dlp to ${path.relative(root, target)} (${(body.length / 1e6).toFixed(1)} MB).`);
  } catch (error) {
    finish(`Couldn't download yt-dlp: ${error instanceof Error ? error.message : error}`);
  }
}

function finish(message) {
  // When starting the app, carry on: a yt-dlp on PATH may still work.
  console.error(ifMissing ? `${message}\nContinuing; the server will look for yt-dlp on PATH.` : message);
  process.exit(ifMissing ? 0 : 1);
}
