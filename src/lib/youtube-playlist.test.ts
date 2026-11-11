import { describe, expect, it } from "vitest";
import { cleanYoutubeTitle, extractInitialData, parsePlaylistItems, youtubePlaylistId } from "./youtube-playlist";

const video = (id: string, title: string, channel: string) => ({
  playlistVideoRenderer: { videoId: id, title: { runs: [{ text: title }] }, shortBylineText: { runs: [{ text: channel }] } },
});
const more = (token: string) => ({
  continuationItemRenderer: {
    continuationEndpoint: { commandExecutorCommand: { commands: [{ continuationCommand: { token } }] } },
  },
});

describe("youtube playlist reader", () => {
  it("reads the playlist id from YouTube Music links", () => {
    expect(youtubePlaylistId("https://music.youtube.com/playlist?list=PLDuxOnqbSQ2U&si=abc")).toBe("PLDuxOnqbSQ2U");
    expect(youtubePlaylistId("https://www.youtube.com/watch?v=abc")).toBeNull();
  });

  it("splits Artist - Title and drops official video tags", () => {
    expect(cleanYoutubeTitle("Sub Focus - Off The Ground (Official Video)", "Sub Focus")).toEqual({
      artist: "Sub Focus",
      name: "Off The Ground",
    });
    expect(cleanYoutubeTitle("Skyline", "OM BooyakaMix - Topic")).toEqual({ artist: "OM BooyakaMix", name: "Skyline" });
  });

  it("uses only the song list's next-page token, not related shelves", () => {
    const data = {
      list: [video("a", "A - One", "x"), video("b", "Two", "B - Topic"), more("songs-next")],
      related: [{ lockupViewModel: {} }, more("shelf-next")],
    };
    const r = parsePlaylistItems(data);
    expect(r.tracks.map((t) => `${t.artist}|${t.name}`)).toEqual(["A|One", "B|Two"]);
    expect(r.continuation).toBe("songs-next");
  });

  it("extracts ytInitialData from page HTML", () => {
    const html = `<script>var ytInitialData = {"a":"}{","b":[1]};</script>`;
    expect(extractInitialData(html)).toEqual({ a: "}{", b: [1] });
  });
});
