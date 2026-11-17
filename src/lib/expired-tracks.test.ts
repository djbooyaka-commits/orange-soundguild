import { test } from "node:test";
import assert from "node:assert/strict";
import { expiredTrackIds, tracksToReAdd } from "./api/beta-auto-remove.server.ts";
import { canAutoRemoveExpired } from "./api/expired-tracks.server.ts";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-11-17T00:00:00Z");
const ago = (d: number) => new Date(now - d * DAY).toISOString();

test("30-day playlist: songs on it over 30 days are removed, newer ones stay", () => {
  const items = [
    { id: "old", added_at: ago(31) },
    { id: "new", added_at: ago(29) },
  ];
  assert.deepEqual(expiredTrackIds(items, 30, now), ["old"]);
});

test("15-day playlist: songs on it over 15 days are removed", () => {
  const items = [
    { id: "a", added_at: ago(16) },
    { id: "b", added_at: ago(14) },
  ];
  assert.deepEqual(expiredTrackIds(items, 15, now), ["a"]);
});

test("hold days of 0 never removes anything", () => {
  assert.deepEqual(expiredTrackIds([{ id: "a", added_at: ago(400) }], 0, now), []);
});

test("auto-remove old songs is never allowed on team or OSG Artists playlists", () => {
  assert.equal(canAutoRemoveExpired({ is_team: true }), false);
  assert.equal(canAutoRemoveExpired({ is_osg: true }), false);
  assert.equal(canAutoRemoveExpired({ is_team: false, platform: "youtube" }), false);
  assert.equal(canAutoRemoveExpired({ is_team: false, platform: "spotify" }), true);
});

test("re-add after a pass skips tracks the curator already put back by hand", () => {
  assert.deepEqual(tracksToReAdd(["x", "y", "z"], new Set(["y"])), ["x", "z"]);
  assert.deepEqual(tracksToReAdd(["x"], new Set(["x"])), []);
});

import { syncAutoRemovals } from "./api/beta-auto-remove.server.ts";

async function runRestore(onPlaylist: string[], addOk = true) {
  const realFetch = globalThis.fetch;
  const added: string[][] = [];
  let deleted = false;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      added.push(JSON.parse(String(init.body)).uris);
      return new Response("{}", { status: addOk ? 201 : 500 });
    }
    return new Response(
      JSON.stringify({ items: onPlaylist.map((id) => ({ item: { id, name: id, artists: [] } })), next: null }),
    );
  }) as typeof fetch;
  const admin = {
    from: () => ({
      select: () => ({
        eq: async () => ({
          data: [
            { user_id: "m", spotify_track_id: "x" },
            { user_id: "m", spotify_track_id: "y" },
          ],
        }),
      }),
      delete: () => ({ eq: () => ({ eq: async () => { deleted = true; return {}; } }) }),
    }),
  };
  try {
    const r = await syncAutoRemovals(admin, {
      playlistId: "pl",
      spotifyPlaylistId: "sp",
      ownerId: "curator",
      threshold: 3,
      periodDays: 7,
      members: [{ user_id: "m", last_deduction_at: null, joined_at: null, passed: true }],
      accessToken: "token",
    });
    return { added, deleted, pending: r.pendingRestore };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("passed member: only the track not already on Spotify is added back", async () => {
  const r = await runRestore(["y"]);
  assert.deepEqual(r.added, [["spotify:track:x"]]);
  assert.equal(r.deleted, true);
  assert.deepEqual(r.pending, []);
});

test("passed member: nothing is added when the curator already re-added every track", async () => {
  const r = await runRestore(["x", "y"]);
  assert.deepEqual(r.added, []);
  assert.equal(r.deleted, true);
});

test("passed member stays 'Re-add pending' when Spotify refuses the add", async () => {
  const r = await runRestore([], false);
  assert.equal(r.deleted, false);
  assert.deepEqual(r.pending, ["m"]);
});
