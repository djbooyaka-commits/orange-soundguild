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

import { trackLinkError, externalTrackKey } from "./playlist-platforms.ts";

test("YouTube room playlists take YouTube track links, not Spotify", () => {
  assert.equal(trackLinkError("youtube", "https://music.youtube.com/watch?v=abc"), null);
  assert.equal(trackLinkError("youtube", "https://youtu.be/abc"), null);
  assert.match(trackLinkError("youtube", "https://open.spotify.com/track/abc") ?? "", /YouTube/);
});

test("Tidal and Apple Music room playlists take their own links", () => {
  assert.equal(trackLinkError("tidal", "https://tidal.com/browse/track/123"), null);
  assert.match(trackLinkError("tidal", "https://music.apple.com/us/song/x/1") ?? "", /Tidal/);
  assert.equal(trackLinkError("apple_music", "https://music.apple.com/us/song/x/1"), null);
  assert.match(trackLinkError("apple_music", "https://tidal.com/browse/track/123") ?? "", /Apple Music/);
});

test("Spotify room playlists still require a Spotify track link", () => {
  assert.equal(trackLinkError("spotify", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"), null);
  assert.match(trackLinkError("spotify", "https://music.youtube.com/watch?v=abc") ?? "", /Spotify/);
});

test("external track key ignores letter case", () => {
  assert.equal(externalTrackKey({ artist: "Drake", name: "One Dance" }), externalTrackKey({ artist: "drake", name: "ONE DANCE" }));
});
