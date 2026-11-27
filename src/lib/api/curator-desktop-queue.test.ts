import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { loadDesktopQueue, markDesktopTracksAdded } from "./curator-desktop-queue.server";

type Row = Record<string, string | boolean | null>;
function fixture() {
  const song = "1234567890123456789012";
  const tables: Record<string, Row[]> = {
    beta_rooms: [{ id: "room", name: "Radio", owner_id: "owner" }, { id: "other-room", name: "Other", owner_id: "other" }],
    beta_room_playlists: [
      { id: "lastfm", room_id: "room", name: "Radio playlist", platform: "spotify", spotify_playlist_id: song },
      { id: "youtube", room_id: "room", name: "Videos", platform: "youtube", spotify_playlist_id: song },
      { id: "other", room_id: "other-room", name: "Other", platform: "spotify", spotify_playlist_id: song },
    ],
    curator_playlists: [{ id: "curator", curator_id: "owner", name: "Main playlist", spotify_playlist_id: song }],
    curator_submissions: [{ id: "main-song", curator_id: "owner", curator_playlist_id: "curator", status: "approved", added_to_spotify: false, spotify_track_id: song, spotify_track_name: "Main song" }],
    beta_submissions: [
      { id: "room-song", playlist_id: "lastfm", status: "approved", added_to_spotify: false, spotify_track_id: song, spotify_track_name: "Room song" },
      { id: "pending", playlist_id: "lastfm", status: "pending", added_to_spotify: false, spotify_track_id: song, spotify_track_name: "Pending" },
      { id: "added", playlist_id: "lastfm", status: "approved", added_to_spotify: true, spotify_track_id: song, spotify_track_name: "Added" },
      { id: "video-song", playlist_id: "youtube", status: "approved", added_to_spotify: false, spotify_track_id: song, spotify_track_name: "Video" },
      { id: "other-song", playlist_id: "other", status: "approved", added_to_spotify: false, spotify_track_id: song, spotify_track_name: "Other" },
      { id: "external", playlist_id: "lastfm", status: "approved", added_to_spotify: false, spotify_track_id: "ext:artist|title", spotify_track_name: "External" },
    ],
  };
  const db = { from(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let update: Row | undefined;
    const query = {
      select() { return query; }, order() { return query; }, limit() { return query; },
      eq(key: string, value: unknown) { filters.push((r) => r[key] === value); return query; },
      in(key: string, values: unknown[]) { filters.push((r) => values.includes(r[key])); return query; },
      update(value: Row) { update = value; return query; },
      then(resolve: (v: { data: Row[]; error: null }) => unknown) {
        const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        if (update) rows.forEach((r) => Object.assign(r, update));
        return Promise.resolve(resolve({ data: rows, error: null }));
      },
    };
    return query;
  } } as unknown as SupabaseClient<Database>;
  return { db, tables };
}

test("desktop queue includes approved unadded Last.fm Spotify tracks alongside curator tracks", async () => {
  const { db } = fixture();
  const result = await loadDesktopQueue(db, "owner");
  assert.deepEqual(result.playlists.map((p) => p.tracks.map((t) => t.id)), [["main-song"], ["room-song"]]);
  assert.equal(result.playlists[1]?.spotify_playlist_id, "1234567890123456789012");
});

test("confirmation marks both queues but cannot mark pending, foreign-room or non-Spotify submissions", async () => {
  const { db, tables } = fixture();
  const result = await markDesktopTracksAdded(db, "owner", ["main-song", "room-song", "pending", "other-song", "video-song"]);
  assert.equal(result.updated, 2);
  const rows = tables["beta_submissions"] ?? [];
  assert.equal(rows.find((r) => r["id"] === "room-song")?.["added_to_spotify"], true);
  for (const id of ["pending", "other-song", "video-song"]) {
    assert.equal(rows.find((r) => r["id"] === id)?.["added_to_spotify"], false);
  }
  assert.equal((await markDesktopTracksAdded(db, "owner", ["main-song", "room-song"])).updated, 0);
});

test("another curator does not receive the owner's Last.fm queue", async () => {
  const { db } = fixture();
  assert.deepEqual(await loadDesktopQueue(db, "stranger"), { playlists: [] });
});