import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPlaylistPlatform, parseTracklist } from "./playlist-platforms.ts";

test("detects each supported service", () => {
  assert.equal(detectPlaylistPlatform("https://open.spotify.com/playlist/abc"), "spotify");
  assert.equal(detectPlaylistPlatform("https://music.youtube.com/playlist?list=x"), "youtube");
  assert.equal(detectPlaylistPlatform("https://tidal.com/browse/playlist/x"), "tidal");
  assert.equal(detectPlaylistPlatform("https://music.apple.com/us/playlist/x"), "apple_music");
  assert.equal(detectPlaylistPlatform("https://orangesoundguild.com/top100"), "osg");
  assert.equal(detectPlaylistPlatform("https://example.com/x"), null);
});

test("parses Artist - Song lines", () => {
  assert.deepEqual(parseTracklist("1. Drake - One Dance\nbad line\nDrake - One Dance"), [
    { artist: "Drake", name: "One Dance" },
  ]);
});
