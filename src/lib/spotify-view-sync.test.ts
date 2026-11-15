import { test } from "node:test";
import assert from "node:assert/strict";
import { isSpotifyViewSyncDue, spotifyViewSyncCutoffIso, SPOTIFY_VIEW_SYNC_INTERVAL_MS } from "./spotify-view-sync";

const now = Date.parse("2026-11-15T12:00:00Z");

test("throttle window is one hour", () => {
  assert.equal(SPOTIFY_VIEW_SYNC_INTERVAL_MS, 60 * 60 * 1000);
});

test("never synced on view -> sync now", () => {
  assert.equal(isSpotifyViewSyncDue(null, now), true);
});

test("synced 59 minutes ago -> skip", () => {
  assert.equal(isSpotifyViewSyncDue(now - 59 * 60 * 1000, now), false);
});

test("synced exactly an hour ago -> sync again", () => {
  assert.equal(isSpotifyViewSyncDue(new Date(now - 60 * 60 * 1000).toISOString(), now), true);
});

test("cutoff is one hour before now", () => {
  assert.equal(spotifyViewSyncCutoffIso(now), "2026-11-15T11:00:00.000Z");
});
