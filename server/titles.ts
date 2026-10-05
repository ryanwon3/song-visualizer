export interface SongIdentity {
  title: string;
  artists: string[];
}

const SEPARATOR = /\s+[-–—~]\s+/;
const FEATURING = /\s*\b(?:feat\.?|ft\.?|featuring)\s+/i;
// Bracketed tags that describe the upload rather than the song.
const NOISE =
  /\b(official|video|audio|lyrics?|visuali[sz]er|m\/?v|hd|hq|4k|8k|1080p|720p|remaster(ed)?|explicit|clean|colou?r coded|full song|performance|clip officiel|vertical|360°?)\b/i;

/**
 * Turns a YouTube video title like `Artist - Song (Official Video) [4K]` into
 * a song title and artist list. Falls back to the channel name for the artist
 * when the title doesn't name one.
 */
export function parseVideoTitle(videoTitle: string, channel: string | null | undefined): SongIdentity {
  let text = videoTitle.trim();
  const featured: string[] = [];

  // Drop bracketed noise and pull out bracketed featured artists.
  text = text.replace(/\s*[([【「]([^)\]】」]*)[)\]】」]/g, (group, inner: string) => {
    const feat = FEATURING.exec(` ${inner}`);
    if (feat && feat.index === 0) {
      featured.push(...splitNames(inner.slice(inner.search(/\s/) + 1)));
      return "";
    }
    return NOISE.test(inner) ? "" : group;
  });

  // "Song | Official Video" and "Song // Live at X" carry nothing we want.
  text = text.split(/\s+(?:\||\/\/)\s+/)[0];

  let artistPart: string | null = null;
  let titlePart = text;
  const separator = SEPARATOR.exec(text);
  if (separator) {
    artistPart = text.slice(0, separator.index);
    titlePart = text.slice(separator.index + separator[0].length);
  }

  // Unbracketed "feat. X" can trail either side.
  [titlePart, artistPart] = [titlePart, artistPart].map((part) => {
    if (!part) return part;
    const feat = FEATURING.exec(part);
    if (!feat) return part;
    featured.push(...splitNames(part.slice(feat.index + feat[0].length)));
    return part.slice(0, feat.index);
  }) as [string, string | null];

  const title = stripQuotes(titlePart.trim()) || videoTitle.trim();
  const primary = artistPart?.trim() || cleanChannelName(channel);
  const artists = [primary, ...featured].filter((name): name is string => Boolean(name));
  return { title, artists: dedupe(artists) };
}

/** "Rick Astley - Topic" → "Rick Astley", "TaylorSwiftVEVO" → "Taylor Swift". */
export function cleanChannelName(channel: string | null | undefined): string | null {
  if (!channel) return null;
  let name = channel.trim().replace(/\s+-\s+Topic$/i, "");
  if (/vevo$/i.test(name)) {
    name = name.replace(/\s*vevo$/i, "").replace(/([a-z])([A-Z])/g, "$1 $2");
  }
  name = name.replace(/\s+(?:official|music|official music)$/i, "");
  return name.trim() || null;
}

function splitNames(text: string): string[] {
  return text
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);
}

function stripQuotes(text: string): string {
  const quoted = /^["'“‘«](.+)["'”’»]$/.exec(text);
  return quoted ? quoted[1].trim() : text;
}

function dedupe(names: string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Lowercases and strips accents and punctuation so titles can be compared. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
