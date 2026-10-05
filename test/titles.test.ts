import { describe, expect, it } from "vitest";
import { cleanChannelName, parseVideoTitle } from "../server/titles.ts";

describe("parseVideoTitle", () => {
  it.each([
    ["Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)", "Rick Astley", "Never Gonna Give You Up", ["Rick Astley"]],
    ["Billie Eilish - bad guy (Official Music Video)", "BillieEilishVEVO", "bad guy", ["Billie Eilish"]],
    ["Daft Punk - Get Lucky (Official Audio) ft. Pharrell Williams, Nile Rodgers", "Daft Punk", "Get Lucky", ["Daft Punk", "Pharrell Williams", "Nile Rodgers"]],
    ["Mark Ronson - Uptown Funk (Official Video) ft. Bruno Mars", "Mark Ronson", "Uptown Funk", ["Mark Ronson", "Bruno Mars"]],
    ["The Weeknd – Blinding Lights [Lyrics]", "7clouds", "Blinding Lights", ["The Weeknd"]],
    ['Queen — "Bohemian Rhapsody" | Official Video', "Queen Official", "Bohemian Rhapsody", ["Queen"]],
    ["Kendrick Lamar - Not Like Us (feat. Someone & Another)", "Kendrick Lamar", "Not Like Us", ["Kendrick Lamar", "Someone", "Another"]],
    ["Nirvana - Smells Like Teen Spirit (Live at Reading 1992)", "Nirvana", "Smells Like Teen Spirit (Live at Reading 1992)", ["Nirvana"]],
  ])("splits %j", (videoTitle, channel, title, artists) => {
    expect(parseVideoTitle(videoTitle, channel)).toEqual({ title, artists });
  });

  it("uses the channel as the artist when the title has none", () => {
    expect(parseVideoTitle("Never Gonna Give You Up", "Rick Astley - Topic")).toEqual({
      title: "Never Gonna Give You Up",
      artists: ["Rick Astley"],
    });
    expect(parseVideoTitle("bad guy (Official Music Video)", "BillieEilishVEVO")).toEqual({
      title: "bad guy",
      artists: ["Billie Eilish"],
    });
  });

  it("keeps the original title when cleaning would leave nothing", () => {
    expect(parseVideoTitle("(Official Video)", "Someone")).toEqual({ title: "(Official Video)", artists: ["Someone"] });
  });
});

describe("cleanChannelName", () => {
  it.each([
    ["Rick Astley - Topic", "Rick Astley"],
    ["TaylorSwiftVEVO", "Taylor Swift"],
    ["Queen Official", "Queen"],
    ["Daft Punk", "Daft Punk"],
    ["", null],
    [null, null],
  ])("%j → %j", (channel, expected) => {
    expect(cleanChannelName(channel)).toBe(expected);
  });
});
