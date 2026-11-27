import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;
const spotifyId = /^[A-Za-z0-9]{22}$/;

async function ownedSpotifyRoomPlaylists(db: Client, ownerId: string) {
  const rooms = await db.from("beta_rooms").select("id, name").eq("owner_id", ownerId);
  if (rooms.error) throw new Error("Could not load rooms");
  if (!rooms.data?.length) return [];
  const playlists = await db.from("beta_room_playlists")
    .select("id, room_id, name, spotify_playlist_id")
    .in("room_id", rooms.data.map((r) => r.id)).eq("platform", "spotify");
  if (playlists.error) throw new Error("Could not load room playlists");
  return (playlists.data ?? []).filter((p) => spotifyId.test(p.spotify_playlist_id))
    .map((p) => ({ ...p, roomName: rooms.data?.find((r) => r.id === p.room_id)?.name ?? "Last.fm room" }));
}

export async function loadDesktopQueue(db: Client, ownerId: string) {
  const [subs, playlists, roomPlaylists] = await Promise.all([
    db.from("curator_submissions")
      .select("id, spotify_track_id, spotify_track_name, curator_playlist_id")
      .eq("curator_id", ownerId).eq("status", "approved").eq("added_to_spotify", false)
      .order("created_at", { ascending: true }).limit(500),
    db.from("curator_playlists").select("id, name, spotify_playlist_id").eq("curator_id", ownerId),
    ownedSpotifyRoomPlaylists(db, ownerId),
  ]);
  if (subs.error || playlists.error) throw new Error("Could not load curator queue");
  const roomSubs = roomPlaylists.length
    ? await db.from("beta_submissions")
      .select("id, playlist_id, spotify_track_id, spotify_track_name")
      .in("playlist_id", roomPlaylists.map((p) => p.id))
      .eq("status", "approved").eq("added_to_spotify", false)
      .order("created_at", { ascending: true }).limit(500)
    : { data: [], error: null };
  if (roomSubs.error) throw new Error("Could not load Last.fm queue");
  const track = (s: { id: string; spotify_track_id: string; spotify_track_name: string | null }) =>
    ({ id: s.id, uri: `spotify:track:${s.spotify_track_id}`, name: s.spotify_track_name ?? s.spotify_track_id });
  return { playlists: [
    ...(playlists.data ?? []).filter((p) => spotifyId.test(p.spotify_playlist_id)).map((p) => ({
      id: p.id, name: p.name, spotify_playlist_id: p.spotify_playlist_id,
      tracks: (subs.data ?? []).filter((s) => s.curator_playlist_id === p.id && spotifyId.test(s.spotify_track_id)).map(track),
    })),
    ...roomPlaylists.map((p) => ({
      id: `beta:${p.id}`, name: `${p.name} — Last.fm: ${p.roomName}`, spotify_playlist_id: p.spotify_playlist_id,
      tracks: (roomSubs.data ?? []).filter((s) => s.playlist_id === p.id && spotifyId.test(s.spotify_track_id)).map(track),
    })),
  ] };
}

// UUID-only IDs remain compatible with the existing Windows app. Each table is
// independently owner/playlist scoped; a supplied ID never grants write access.
export async function markDesktopTracksAdded(db: Client, ownerId: string, ids: string[]) {
  if (!ids.length) return { updated: 0 };
  const roomPlaylists = await ownedSpotifyRoomPlaylists(db, ownerId);
  const curatorResult = await db.from("curator_submissions")
    .update({ added_to_spotify: true, spotify_error: null })
    .eq("curator_id", ownerId).eq("status", "approved").eq("added_to_spotify", false).in("id", ids).select("id");
  if (curatorResult.error) throw new Error("Could not update curator queue; reload and retry");
  const roomResult = roomPlaylists.length
    ? await db.from("beta_submissions").update({ added_to_spotify: true, spotify_error: null })
      .in("playlist_id", roomPlaylists.map((p) => p.id)).eq("status", "approved")
      .eq("added_to_spotify", false).in("id", ids).select("id")
    : { data: [], error: null };
  if (roomResult.error) throw new Error("Could not update Last.fm queue; reload and retry");
  return { updated: (curatorResult.data?.length ?? 0) + (roomResult.data?.length ?? 0) };
}