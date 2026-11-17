import { describe, expect, it } from "vitest";
import { expiredTrackIds, tracksToReAdd } from "./api/beta-auto-remove.server";
import { canAutoRemoveExpired } from "./api/expired-tracks.server";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse("2026-11-17T00:00:00Z");
const ago = (d: number) => new Date(now - d * DAY).toISOString();

describe("auto-remove songs past their hold days", () => {
  it("removes songs older than 30 days on a 30-day playlist, keeps newer ones", () => {
    const items = [
      { id: "old", added_at: ago(31) },
      { id: "new", added_at: ago(29) },
    ];
    expect(expiredTrackIds(items, 30, now)).toEqual(["old"]);
  });

  it("uses the 15-day hold on a 15-day playlist", () => {
    const items = [
      { id: "a", added_at: ago(16) },
      { id: "b", added_at: ago(14) },
    ];
    expect(expiredTrackIds(items, 15, now)).toEqual(["a"]);
  });

  it("never removes anything when hold days is 0", () => {
    expect(expiredTrackIds([{ id: "a", added_at: ago(400) }], 0, now)).toEqual([]);
  });

  it("is never allowed on team or OSG Artists playlists", () => {
    expect(canAutoRemoveExpired({ is_team: true })).toBe(false);
    expect(canAutoRemoveExpired({ is_osg: true })).toBe(false);
    expect(canAutoRemoveExpired({ is_team: false, platform: "youtube" })).toBe(false);
    expect(canAutoRemoveExpired({ is_team: false, platform: "spotify" })).toBe(true);
  });
});

describe("re-adding a passed member's tracks", () => {
  it("skips tracks the curator already put back by hand", () => {
    expect(tracksToReAdd(["x", "y", "z"], new Set(["y"]))).toEqual(["x", "z"]);
  });

  it("adds nothing when every track is already back", () => {
    expect(tracksToReAdd(["x"], new Set(["x"]))).toEqual([]);
  });
});
