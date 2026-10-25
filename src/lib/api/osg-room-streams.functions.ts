import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const osgIdFrom = (url: string | null) => (url ?? "").match(UUID)?.[0] ?? null;
const keyFor = (artist: string, name: string) =>
  `ext:${artist.toLowerCase()}|${name.toLowerCase()}`.slice(0, 250);

/**
 * Records a completed on-site play of an OSG track for every Orange Sound Guild
 * room playlist the listener belongs to that contains the track. No Last.fm
 * or Start/Stop session is needed: the web player already proves the play.
 */
export const recordOsgRoomPlay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { trackId: string }) => ({ trackId: String(d?.trackId ?? "") }))
  .handler(async ({ context, data }) => {
    if (!UUID.test(data.trackId)) return { added: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    const [{ data: mem }, { data: owned }] = await Promise.all([
      supabaseAdmin.from("beta_room_members").select("room_id").eq("user_id", uid),
      supabaseAdmin.from("beta_rooms").select("id").eq("owner_id", uid),
    ]);
    const roomIds = Array.from(
      new Set([...(mem ?? []).map((m) => m.room_id as string), ...(owned ?? []).map((r) => r.id as string)]),
    );
    if (!roomIds.length) return { added: 0 };
    const { data: pls } = await supabaseAdmin
      .from("beta_room_playlists")
      .select("id, room_id, external_url")
      .eq("platform", "osg")
      .in("room_id", roomIds);
    if (!pls?.length) return { added: 0 };
    const { data: hits } = await supabaseAdmin
      .from("playlist_tracks")
      .select("playlist_id")
      .eq("track_id", data.trackId);
    const containing = new Set((hits ?? []).map((h) => h.playlist_id as string));
    const targets = pls.filter((p) => {
      const id = osgIdFrom(p.external_url as string | null);
      return id && containing.has(id);
    });
    if (!targets.length) return { added: 0 };
    const { data: t } = await supabaseAdmin
      .from("tracks")
      .select("title, profiles(username)")
      .eq("id", data.trackId)
      .maybeSingle();
    if (!t) return { added: 0 };
    const artist = ((t as any).profiles?.username as string | null) ?? "Artist";
    const key = keyFor(artist, t.title as string);
    const playedAt = new Date().toISOString();
    const rows = targets.map((p) => ({
      room_id: p.room_id as string,
      user_id: uid,
      playlist_id: p.id as string,
      spotify_track_id: key,
      spotify_track_name: t.title as string,
      played_at: playedAt,
      source: "osg_player",
    }));
    const { error } = await supabaseAdmin
      .from("beta_stream_points")
      .upsert(rows, { onConflict: "room_id,user_id,spotify_track_id,played_at", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { added: rows.length };
  });

/** Re-imports an OSG room playlist's tracks from the source OSG playlist. Owner only. */
export const syncOsgRoomPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { playlistId: string }) => ({ playlistId: String(d?.playlistId ?? "") }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pl } = await supabaseAdmin
      .from("beta_room_playlists")
      .select("id, room_id, external_url, platform")
      .eq("id", data.playlistId)
      .maybeSingle();
    if (!pl || pl.platform !== "osg") throw new Error("Playlist not found");
    const { data: room } = await supabaseAdmin
      .from("beta_rooms")
      .select("owner_id")
      .eq("id", pl.room_id)
      .maybeSingle();
    if (room?.owner_id !== context.userId) throw new Error("Only the curator can sync");
    const osgId = osgIdFrom(pl.external_url as string | null);
    if (!osgId) throw new Error("Invalid Orange Sound Guild playlist link");
    const { data: src } = await supabaseAdmin.from("playlists").select("name").eq("id", osgId).maybeSingle();
    const { data: items } = await supabaseAdmin.from("playlist_tracks").select("track_id").eq("playlist_id", osgId);
    const ids = (items ?? []).map((i) => i.track_id as string).filter((id) => UUID.test(id));
    const { data: trs } = ids.length
      ? await supabaseAdmin.from("tracks").select("title, profiles(username)").in("id", ids)
      : { data: [] as any[] };
    const rows = (trs ?? []).map((t: any) => {
      const artist = (t.profiles?.username as string | null) ?? "Artist";
      return {
        room_id: pl.room_id as string,
        playlist_id: pl.id as string,
        spotify_track_id: keyFor(artist, t.title),
        track_name: t.title as string,
        artist_name: artist,
      };
    });
    const uniq = Array.from(new Map(rows.map((r) => [r.spotify_track_id, r])).values());
    await supabaseAdmin.from("beta_room_tracks").delete().eq("playlist_id", pl.id);
    if (uniq.length) {
      const { error } = await supabaseAdmin.from("beta_room_tracks").insert(uniq);
      if (error) throw new Error(error.message);
    }
    if (src?.name) await supabaseAdmin.from("beta_room_playlists").update({ name: src.name }).eq("id", pl.id);
    return { imported: uniq.length };
  });
