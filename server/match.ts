import { normalizeForMatch } from "./titles.ts";

export interface SearchResult {
  id: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
}

export interface MatchTarget {
  title: string;
  artists: string[];
  durationSec: number;
}

// Versions of a song that would be the wrong audio unless the track itself is one.
const ALTERNATE_VERSIONS = [
  "live",
  "cover",
  "remix",
  "karaoke",
  "instrumental",
  "acoustic",
  "sped up",
  "slowed",
  "reverb",
  "nightcore",
  "8d",
  "1 hour",
  "10 hours",
  "loop",
  "reaction",
  "tutorial",
  "piano",
  "guitar",
  "drum",
  "bass boosted",
  "extended",
  "mashup",
  "edit",
  "version",
  "demo",
  "teaser",
  "snippet",
];

/**
 * Scores YouTube search results against a Spotify track and returns the one
 * most likely to be the same recording, or null when nothing is close enough.
 *
 * Length matters most: an upload whose length matches the studio track is
 * almost always the same recording, which keeps lyric timings lined up.
 */
export function pickBestMatch(target: MatchTarget, results: SearchResult[]): SearchResult | null {
  let best: SearchResult | null = null;
  let bestScore = -Infinity;
  for (const [rank, result] of results.entries()) {
    // Earlier search results win ties.
    const score = scoreResult(target, result) - rank;
    if (score >= MIN_SCORE && score > bestScore) {
      best = result;
      bestScore = score;
    }
  }
  return best;
}

const MIN_SCORE = 20;

export function scoreResult(target: MatchTarget, result: SearchResult): number {
  const title = normalizeForMatch(result.title);
  const channel = normalizeForMatch(result.channel ?? "");
  const fullTitle = normalizeForMatch(target.title);
  const trackTitle = normalizeForMatch(coreTitle(target.title));
  const primaryArtist = normalizeForMatch(target.artists[0] ?? "");
  let score = 0;

  if (containsPhrase(title, trackTitle)) score += 30;
  else if (wordOverlap(trackTitle, title) >= 0.6) score += 12;

  if (primaryArtist && (containsPhrase(title, primaryArtist) || containsPhrase(channel, primaryArtist))) score += 20;
  // The artist's own channel, "Artist - Topic" or "ArtistVEVO": label-supplied audio.
  const compactChannel = channel.replace(/ /g, "").replace(/(topic|vevo)$/, "");
  if (primaryArtist && compactChannel === primaryArtist.replace(/ /g, "")) score += 10;
  if (/ topic$/.test(channel) || /\bofficial audio\b/.test(title)) score += 6;

  for (const word of ALTERNATE_VERSIONS) {
    if (containsPhrase(title, word) && !containsPhrase(fullTitle, word)) score -= 25;
  }

  if (result.durationSec && target.durationSec) {
    const diff = Math.abs(result.durationSec - target.durationSec);
    if (diff <= 2) score += 35;
    else if (diff <= 5) score += 25;
    else if (diff <= 15) score += 8;
    else if (diff <= 40) score -= 10;
    else score -= 40;
  }

  return score;
}

/**
 * Strips the parts of a Spotify title that YouTube uploads usually leave out:
 * "Get Lucky (Radio Edit) [feat. Pharrell Williams]" → "Get Lucky",
 * "Here Comes The Sun - Remastered 2009" → "Here Comes The Sun".
 */
export function coreTitle(title: string): string {
  const core = title
    .replace(/\s*[([](?:feat\.?|ft\.?|featuring|with)\s[^)\]]*[)\]]/gi, "")
    .replace(/\s*[([][^)\]]*\b(?:remaster(?:ed)?|radio edit|single version|mono|stereo)\b[^)\]]*[)\]]/gi, "")
    .replace(/\s+-\s+[^-]*\b(?:remaster(?:ed)?|radio edit|single version|mono|stereo|\d{4} mix)\b.*$/i, "")
    .trim();
  return core || title.trim();
}

function containsPhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  return ` ${haystack} `.includes(` ${phrase} `);
}

function wordOverlap(phrase: string, haystack: string): number {
  const words = phrase.split(" ").filter(Boolean);
  if (!words.length) return 0;
  const present = new Set(haystack.split(" "));
  return words.filter((word) => present.has(word)).length / words.length;
}
