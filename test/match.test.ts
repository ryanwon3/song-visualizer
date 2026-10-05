import { describe, expect, it } from "vitest";
import { coreTitle, pickBestMatch, type SearchResult } from "../server/match.ts";

// Real YouTube search results (October 2026), trimmed to the fields used.
const getLuckyResults: SearchResult[] = [
  { id: "a1", title: "Daft Punk - Get Lucky (Official Audio) ft. Pharrell Williams, Nile Rodgers", channel: "Daft Punk", durationSec: 249 },
  { id: "a2", title: "Daft Punk - Get Lucky (Official Video) feat. Pharrell Williams and Nile Rodgers", channel: "convar HUN", durationSec: 248 },
  { id: "a3", title: "Daft Punk - Get Lucky (Lyrics) ft. Pharrell Williams, Nile Rodgers", channel: "7clouds", durationSec: 246 },
  { id: "a4", title: "Daft Punk - Get Lucky (Feat. Pharrell Williams)", channel: "EXPO STORY", durationSec: 369 },
  { id: "a5", title: "Daft Punk - 'Get Lucky' (10 min loop)", channel: "nTOURIST", durationSec: 600 },
  { id: "a6", title: "Daft Punk ft. Pharell Williams Get lucky Extended Version Original Video Full HD", channel: "pfigueroah", durationSec: 1088 },
];

const rickResults: SearchResult[] = [
  { id: "dQw4w9WgXcQ", title: "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)", channel: "Rick Astley", durationSec: 214 },
  { id: "b2", title: "Never Gonna Give You Up | Rick Astley Rocks New Year's Eve - BBC", channel: "BBC", durationSec: 234 },
  { id: "b3", title: "Rick Astley - Never Gonna Give You Up (Official Music Video) (1987)", channel: "Super Top Songs", durationSec: 213 },
  { id: "b4", title: "Rick Astley - Never Gonna Give You Up", channel: "Amazing Lyrics", durationSec: 214 },
  { id: "b5", title: "Rick Astley - Never Gonna Give You Up | Glastonbury 2023", channel: "BBC Music", durationSec: 560 },
  { id: "b6", title: "Foo Fighters With Rick Astley - Never Gonna Give You Up - London O2 Arena", channel: "GotsomePearlJam", durationSec: 278 },
];

describe("pickBestMatch", () => {
  it("prefers the artist's own upload of the same length", () => {
    const track = {
      title: "Get Lucky (Radio Edit) [feat. Pharrell Williams and Nile Rodgers]",
      artists: ["Daft Punk", "Pharrell Williams", "Nile Rodgers"],
      durationSec: 248,
    };
    expect(pickBestMatch(track, getLuckyResults)?.id).toBe("a1");
  });

  it("picks the official upload over re-uploads with the same audio", () => {
    const track = { title: "Never Gonna Give You Up", artists: ["Rick Astley"], durationSec: 214 };
    expect(pickBestMatch(track, rickResults)?.id).toBe("dQw4w9WgXcQ");
  });

  it("avoids live and cover versions unless the track is one", () => {
    const results: SearchResult[] = [
      { id: "live", title: "Nirvana - Smells Like Teen Spirit (Live at Reading 1992)", channel: "Nirvana", durationSec: 302 },
      { id: "cover", title: "Smells Like Teen Spirit - Nirvana (piano cover)", channel: "Piano Guy", durationSec: 301 },
      { id: "studio", title: "Nirvana - Smells Like Teen Spirit (Lyrics)", channel: "7clouds Rock", durationSec: 300 },
    ];
    const studio = { title: "Smells Like Teen Spirit", artists: ["Nirvana"], durationSec: 301 };
    expect(pickBestMatch(studio, results)?.id).toBe("studio");

    const live = { title: "Smells Like Teen Spirit - Live at Reading 1992", artists: ["Nirvana"], durationSec: 302 };
    expect(pickBestMatch(live, results)?.id).toBe("live");
  });

  it("returns null when nothing is close", () => {
    const track = { title: "Some Obscure Song", artists: ["Nobody Knows"], durationSec: 180 };
    expect(pickBestMatch(track, rickResults)).toBeNull();
    expect(pickBestMatch(track, [])).toBeNull();
  });
});

describe("coreTitle", () => {
  it.each([
    ["Get Lucky (Radio Edit) [feat. Pharrell Williams and Nile Rodgers]", "Get Lucky"],
    ["Here Comes The Sun - Remastered 2009", "Here Comes The Sun"],
    ["Bohemian Rhapsody - Remastered 2011", "Bohemian Rhapsody"],
    ["Under Pressure (Remastered 2011)", "Under Pressure"],
    ["Smells Like Teen Spirit", "Smells Like Teen Spirit"],
    ["Shake It Off (Taylor's Version)", "Shake It Off (Taylor's Version)"],
    ["Dancing Queen - Live", "Dancing Queen - Live"],
  ])("%j → %j", (title, expected) => {
    expect(coreTitle(title)).toBe(expected);
  });
});
