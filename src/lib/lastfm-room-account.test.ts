import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRoomLastfmUsername } from "./api/lastfm-room-account.ts";

function fakeAdmin(tables: Record<string, Record<string, string>[]>) {
  return {
    from(table: string) {
      let rows = tables[table] ?? [];
      const q: any = {
        select: () => q,
        eq: (col: string, val: string) => {
          rows = rows.filter((r) => r[col] === val);
          return q;
        },
        in: (col: string, vals: string[]) => {
          rows = rows.filter((r) => vals.includes(r[col]));
          return q;
        },
        then: (res: any) => res({ data: rows }),
      };
      return q;
    },
  };
}

const db = fakeAdmin({
  lastfm_connections: [{ user_id: "me", lastfm_username: "spotifyAcct" }],
  beta_room_lastfm_accounts: [
    { room_id: "youtube", user_id: "me", lastfm_username: "youtubeAcct" },
  ],
});

test("the YouTube room uses the member's room Last.fm account", async () => {
  assert.equal(await resolveRoomLastfmUsername(db, "youtube", "me"), "youtubeAcct");
});

test("other rooms keep using the member's default Last.fm account", async () => {
  assert.equal(await resolveRoomLastfmUsername(db, "spotify", "me"), "spotifyAcct");
});

test("a member with no Last.fm account gets none", async () => {
  assert.equal(await resolveRoomLastfmUsername(db, "youtube", "someone"), null);
});
