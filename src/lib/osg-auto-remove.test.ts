import { describe, expect, it, vi } from "vitest";
import { pinMeFirst } from "@/components/OsgDailyStreams";
import { syncAutoRemovals } from "@/lib/api/beta-auto-remove.server";

describe("7-day streams order", () => {
  it("puts the signed-in member's card first even with the fewest points", () => {
    const rows = [
      { user_id: "a", total: 90 },
      { user_id: "b", total: 50 },
      { user_id: "me", total: 3 },
    ];
    expect(pinMeFirst(rows, "me").map((r) => r.user_id)).toEqual(["me", "a", "b"]);
  });
});

describe("OSG auto-remove", () => {
  it("never removes tracks from a member who already meets the minimum", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const admin = {
      from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }),
    };
    await syncAutoRemovals(admin, {
      playlistId: "pl",
      spotifyPlaylistId: "sp",
      ownerId: "curator",
      threshold: 1,
      periodDays: 7,
      // 7 red stars (no pass, joined long ago) but at/above the minimum.
      members: [{ user_id: "m", last_deduction_at: null, joined_at: "2020-01-01T00:00:00Z", passed: true }],
      accessToken: "token",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
