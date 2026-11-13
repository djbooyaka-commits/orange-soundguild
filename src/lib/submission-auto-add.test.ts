import { test } from "node:test";
import assert from "node:assert/strict";
import { autoAddTarget, manualAddNote, submitterAddMessage } from "./submission-auto-add";

test("Spotify playlists auto-add to the curator's Spotify playlist", () => {
  assert.equal(autoAddTarget("spotify"), "spotify");
  assert.equal(autoAddTarget(null), "spotify");
});

test("Orange Sound Guild playlists auto-add to the on-site playlist", () => {
  assert.equal(autoAddTarget("osg"), "osg");
});

test("YouTube, Tidal and Apple Music playlists are tracked but added by hand", () => {
  assert.equal(autoAddTarget("youtube"), "manual");
  assert.equal(autoAddTarget("tidal"), "manual");
  assert.equal(autoAddTarget("apple_music"), "manual");
  assert.match(manualAddNote("youtube"), /YouTube/);
});

test("submitter is told whether the track is already on the playlist", () => {
  assert.match(submitterAddMessage({ added: true, playlistName: "N28", cost: 50 }), /^Added to "N28"/);
  assert.match(submitterAddMessage({ added: false, playlistName: "N28", cost: 0 }), /curator will add it/);
});
