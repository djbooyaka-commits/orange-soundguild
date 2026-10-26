import { test } from "node:test";
import assert from "node:assert/strict";
import { filterSubmissionPlaylists, resolveSubmissionPlaylistId } from "./playlist-submission-selection.ts";

const playlists = [
  { id: "spotify", genre: "Afrobeats" },
  { id: "youtube", platform: "youtube", genre: "Afrobeats" },
  { id: "tidal", platform: "tidal", genre: "Afro House" },
  { id: "apple", platform: "apple_music", genre: "Afrobeats" },
  { id: "osg", platform: "osg", genre: "Afro House" },
];

for (const [platform, id] of [["spotify", "spotify"], ["youtube", "youtube"], ["tidal", "tidal"], ["apple_music", "apple"], ["osg", "osg"]] as const) {
  test(`${platform} includes only its own playlists`, () => {
    assert.deepEqual(filterSubmissionPlaylists(playlists, platform).map((p) => p.id), [id]);
  });
}

test("genre and service filters apply together", () => {
  assert.deepEqual(filterSubmissionPlaylists(playlists, "all", "Afrobeats").map((p) => p.id), ["spotify", "youtube", "apple"]);
  assert.deepEqual(filterSubmissionPlaylists(playlists, "tidal", "Afrobeats"), []);
});

test("card selection stays selected, but changing service cannot retain a hidden playlist", () => {
  assert.equal(resolveSubmissionPlaylistId(playlists, "apple"), "apple");
  assert.equal(resolveSubmissionPlaylistId(filterSubmissionPlaylists(playlists, "tidal"), "apple"), "tidal");
  assert.equal(resolveSubmissionPlaylistId([], "apple"), "");
});