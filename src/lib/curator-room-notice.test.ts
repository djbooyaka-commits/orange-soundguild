import { test } from "node:test";
import assert from "node:assert/strict";
import { curatorRoomAccess } from "./api/curator-room-access.ts";

/** Fake database: tables map to rows; eq() filters, limit()/maybeSingle() resolve. */
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
        limit: async () => ({ data: rows }),
        maybeSingle: async () => ({ data: rows[0] ?? null }),
      };
      return q;
    },
  };
}

const db = fakeAdmin({
  curator_playlists: [{ id: "pl1", curator_id: "curator" }],
  curator_team_members: [{ id: "m1", playlist_id: "pl1", user_id: "member" }],
  osg_artist_picks: [{ id: "p1", user_id: "curator", artist_id: "member" }],
});

test("Spotify team room: only the curator can edit the message", async () => {
  const curator = await curatorRoomAccess(db, { scope: "team", roomKey: "pl1" }, "curator");
  const member = await curatorRoomAccess(db, { scope: "team", roomKey: "pl1" }, "member");
  assert.equal(curator.isOwner, true);
  assert.equal(member.isOwner, false);
});

test("Spotify team room: members see the message, outsiders do not", async () => {
  const member = await curatorRoomAccess(db, { scope: "team", roomKey: "pl1" }, "member");
  const outsider = await curatorRoomAccess(db, { scope: "team", roomKey: "pl1" }, "stranger");
  assert.equal(member.isMember, true);
  assert.equal(outsider.isMember, false);
});

test("OSG Artists room: curator edits, their artists read, others cannot", async () => {
  const curator = await curatorRoomAccess(db, { scope: "osg", roomKey: "curator" }, "curator");
  const member = await curatorRoomAccess(db, { scope: "osg", roomKey: "curator" }, "member");
  const outsider = await curatorRoomAccess(db, { scope: "osg", roomKey: "curator" }, "stranger");
  assert.equal(curator.isOwner, true);
  assert.deepEqual([member.isOwner, member.isMember], [false, true]);
  assert.equal(outsider.isMember, false);
});
