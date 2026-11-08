import { test } from "node:test";
import assert from "node:assert/strict";
import { pinMeFirst } from "./pin-me-first.ts";
import { syncAutoRemovals } from "./api/beta-auto-remove.server.ts";

test("7-day streams: the signed-in member's card is first even with the fewest points", () => {
  const rows = [
    { user_id: "a", total: 90 },
    { user_id: "b", total: 50 },
    { user_id: "me", total: 3 },
  ];
  assert.deepEqual(pinMeFirst(rows, "me").map((r) => r.user_id), ["me", "a", "b"]);
});

test("OSG auto-remove never removes tracks from a member who meets the minimum", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response("{}");
  }) as typeof fetch;
  const admin = { from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }) };
  try {
    await syncAutoRemovals(admin, {
      playlistId: "pl",
      spotifyPlaylistId: "sp",
      ownerId: "curator",
      threshold: 1,
      periodDays: 7,
      // 7 red stars (no pass, joined long ago) but already at/above the minimum.
      members: [{ user_id: "m", last_deduction_at: null, joined_at: "2020-01-01T00:00:00Z", passed: true }],
      accessToken: "token",
    });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls, 0);
});
