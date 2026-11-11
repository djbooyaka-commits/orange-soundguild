import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanYoutubeTitle, extractInitialData, parsePlaylistItems, youtubePlaylistId } from "./youtube-playlist.ts";

const video = (id: string, title: string, channel: string) => ({
  playlistVideoRenderer: { videoId: id, title: { runs: [{ text: title }] }, shortBylineText: { runs: [{ text: channel }] } },
});
const more = (token: string) => ({
  continuationItemRenderer: {
    continuationEndpoint: { commandExecutorCommand: { commands: [{ continuationCommand: { token } }] } },
  },
});

test("reads the playlist id from YouTube Music links", () => {
    assert.equal(youtubePlaylistId("https://music.youtube.com/playlist?list=PLDuxOnqbSQ2U&si=abc"), "PLDuxOnqbSQ2U");
    assert.equal(youtubePlaylistId("https://www.youtube.com/watch?v=abc"), null);
  });

test("splits Artist - Title and drops official video tags", () => {
    assert.deepEqual(cleanYoutubeTitle("Sub Focus - Off The Ground (Official Video)", "Sub Focus"), {
      artist: "Sub Focus",
      name: "Off The Ground",
    });
    assert.deepEqual(cleanYoutubeTitle("Skyline", "OM BooyakaMix - Topic"), { artist: "OM BooyakaMix", name: "Skyline" });
  });

test("uses only the song list's next-page token, not related shelves", () => {
    const data = {
      list: [video("a", "A - One", "x"), video("b", "Two", "B - Topic"), more("songs-next")],
      related: [{ lockupViewModel: {} }, more("shelf-next")],
    };
    const r = parsePlaylistItems(data);
    assert.deepEqual(r.tracks.map((t) => `${t.artist}|${t.name}`), ["A|One", "B|Two"]);
    assert.equal(r.continuation, "songs-next");
  });

test("extracts ytInitialData from page HTML", () => {
    const html = `<script>var ytInitialData = {"a":"}{","b":[1]};</script>`;
    assert.deepEqual(extractInitialData(html), { a: "}{", b: [1] });
  });
