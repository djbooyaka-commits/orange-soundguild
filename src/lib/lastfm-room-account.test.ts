import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRoomLastfmUsername,
  lastfmAccountInUse,
  roomUsesDefaultLastfm,
} from "./api/lastfm-room-account.ts";

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
        ilike: (col: string, pattern: string) => {
          const want = pattern.replace(/\\(.)/g, "$1").toLowerCase();
          rows = rows.filter((r) => String(r[col]).toLowerCase() === want);
          return q;
        },
        then: (res: any) => res({ data: rows }),
      };
      return q;
    },
  };
}

const db = fakeAdmin({
  lastfm_connections: [
    { user_id: "me", lastfm_username: "spotifyAcct" },
    { user_id: "other", lastfm_username: "OtherMain" },
  ],
  beta_room_playlists: [
    { room_id: "spotifyRoom", platform: "spotify" },
    { room_id: "youtube", platform: "youtube" },
    { room_id: "youtube2", platform: "youtube" },
    { room_id: "tidal", platform: "tidal" },
  ],
  beta_room_lastfm_accounts: [
    { room_id: "youtube", user_id: "me", lastfm_username: "youtubeAcct" },
  ],
});

test("the YouTube room uses the member's room Last.fm account", async () => {
  assert.equal(await resolveRoomLastfmUsername(db, "youtube", "me"), "youtubeAcct");
});

test("Spotify rooms keep using the member's default Last.fm account", async () => {
  assert.equal(await resolveRoomLastfmUsername(db, "spotifyRoom", "me"), "spotifyAcct");
});

test("YouTube, Tidal and Apple Music rooms never pre-load the default account", async () => {
  assert.equal(await resolveRoomLastfmUsername(db, "youtube2", "me"), null);
  assert.equal(await resolveRoomLastfmUsername(db, "tidal", "me"), null);
  assert.equal(roomUsesDefaultLastfm(["apple_music"]), false);
  assert.equal(roomUsesDefaultLastfm(["youtube", "spotify"]), true);
});

test("a member with no Last.fm account gets none", async () => {
  assert.equal(await resolveRoomLastfmUsername(db, "youtube", "someone"), null);
});

test("an account used in another room can't be reused", async () => {
  assert.equal(
    await lastfmAccountInUse(db, "youtubeAcct", { roomId: "tidal", userId: "me" }),
    true,
  );
});

test("an account that is anyone's default can't be used as a room account", async () => {
  assert.equal(await lastfmAccountInUse(db, "spotifyAcct", { roomId: "youtube2", userId: "me" }), true);
  assert.equal(await lastfmAccountInUse(db, "othermain", { roomId: "youtube2", userId: "me" }), true);
});

test("re-saving your own account in the same room is allowed", async () => {
  assert.equal(await lastfmAccountInUse(db, "YOUTUBEACCT", { roomId: "youtube", userId: "me" }), false);
});

test("a brand-new account is accepted", async () => {
  assert.equal(await lastfmAccountInUse(db, "freshAcct", { roomId: "tidal", userId: "me" }), false);
});

test("a room account can't become someone's default account", async () => {
  assert.equal(await lastfmAccountInUse(db, "youtubeAcct", { defaultOf: "other" }), true);
  assert.equal(await lastfmAccountInUse(db, "spotifyAcct", { defaultOf: "me" }), false);
});
