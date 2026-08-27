import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Per-playlist "rooms" inside a Last.fm stream room.
 * Each curator playlist gets its own OSG-Artists-style roster of every member
 * of the room, with points earned on that playlist, a weekly minimum and
 * curator-only point removals.
 */

const DEFAULT_WEEKLY_MIN = 600;

async function loadPlaylist(supabaseAdmin: any, playlistId: string) {
  const { data: pl } = await supabaseAdmin
    .from("beta_room_playlists")
    .select("id, room_id, name, image_url, weekly_min, spotify_playlist_id, is_team")
    .eq("id", playlistId)
    .maybeSingle();
  if (!pl) throw new Error("Playlist not found");
  const { data: room } = await supabaseAdmin
    .from("beta_rooms")
    .select("id, owner_id, name")
    .eq("id", pl.room_id)
    .maybeSingle();
  if (!room) throw new Error("Room not found");
  return { pl, room };
}

async function assertRoomMember(supabaseAdmin: any, room: any, userId: string) {
  if (room.owner_id === userId) return true;
  const { data: member } = await supabaseAdmin
    .from("beta_room_members")
    .select("id")
    .eq("room_id", room.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) throw new Error("Join this room first");
  return false;
}

export const getBetaPlaylistRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pl, room } = await loadPlaylist(supabaseAdmin, data.playlistId);
    await assertRoomMember(supabaseAdmin, room, context.userId);
    const isOwner = room.owner_id === context.userId;

    const [
      { data: members },
      { data: tracks },
      { data: subs },
      { data: adjustments },
      { data: links },
      { data: activeTracking },
    ] =
      await Promise.all([
        supabaseAdmin.from("beta_room_members").select("user_id").eq("room_id", room.id),
        supabaseAdmin
          .from("beta_room_tracks")
          .select("spotify_track_id")
          .eq("playlist_id", pl.id),
        supabaseAdmin
          .from("beta_submissions")
          .select("submitter_user_id, cost_points")
          .eq("playlist_id", pl.id),
        supabaseAdmin
          .from("beta_point_adjustments")
          .select("user_id, delta, created_at")
          .eq("playlist_id", pl.id),
        supabaseAdmin
          .from("beta_playlist_member_links")
          .select(
            "user_id, spotify_artist_url, spotify_artist_name, track_url, track_name, track2_url, track2_name, track3_url, track3_name, track4_url, track4_name, track5_url, track5_name",
          )
          .eq("playlist_id", pl.id),
        supabaseAdmin
          .from("beta_playlist_tracking_sessions")
          .select("started_at")
          .eq("playlist_id", pl.id)
          .eq("user_id", context.userId)
          .is("stopped_at", null)
          .maybeSingle(),
      ]);

    const userIds = Array.from(new Set((members ?? []).map((m: any) => m.user_id as string)));
    const trackIds = Array.from(
      new Set((tracks ?? []).map((t: any) => t.spotify_track_id as string)),
    );

    const earned = new Map<string, number>();
    if (userIds.length) {
      // Count every play ever attributed to THIS playlist, even if the track
      // has since been removed from the playlist — points must never drop on
      // their own. Only curator adjustments can reduce them.
      const { data: plays } = await supabaseAdmin
        .from("beta_stream_points")
        .select("user_id, spotify_track_id, playlist_id")
        .eq("room_id", room.id)
        .in("user_id", userIds);
      // Legacy rows without an attribution fall back to the playlist that
      // first held the track in this room.
      const { data: allRoomTracks } = await supabaseAdmin
        .from("beta_room_tracks")
        .select("spotify_track_id, playlist_id, created_at")
        .eq("room_id", room.id)
        .order("created_at", { ascending: true });
      const firstPlaylistByTrack = new Map<string, string>();
      for (const t of allRoomTracks ?? []) {
        if (!t.playlist_id) continue;
        if (!firstPlaylistByTrack.has(t.spotify_track_id)) {
          firstPlaylistByTrack.set(t.spotify_track_id, t.playlist_id as string);
        }
      }
      for (const p of plays ?? []) {
        const pid =
          (p.playlist_id as string | null) ??
          firstPlaylistByTrack.get(p.spotify_track_id as string) ??
          null;
        if (pid !== pl.id) continue;
        earned.set(p.user_id as string, (earned.get(p.user_id as string) ?? 0) + 1);
      }
    }


    const spent = new Map<string, number>();
    for (const s of subs ?? []) {
      const uid = s.submitter_user_id as string;
      spent.set(uid, (spent.get(uid) ?? 0) + (s.cost_points ?? 0));
    }

    const adjusted = new Map<string, number>();
    const lastAdjust = new Map<string, string>();
    for (const a of adjustments ?? []) {
      const uid = a.user_id as string;
      adjusted.set(uid, (adjusted.get(uid) ?? 0) + (a.delta ?? 0));
      const prev = lastAdjust.get(uid);
      if (!prev || new Date(a.created_at as string) > new Date(prev)) {
        lastAdjust.set(uid, a.created_at as string);
      }
    }

    const { data: profiles } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, username, avatar_url, account_type")
          .in("id", userIds)
      : { data: [] as any[] };
    const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const linkByUser = new Map<string, any>(
      (links ?? []).map((l: any) => [l.user_id as string, l]),
    );

    const { data: lastfm } = userIds.length
      ? await supabaseAdmin
          .from("lastfm_connections")
          .select("user_id, lastfm_username")
          .in("user_id", userIds)
      : { data: [] as any[] };
    const lastfmByUser = new Map<string, string>(
      (lastfm ?? []).map((l: any) => [l.user_id as string, l.lastfm_username as string]),
    );

    const min = (pl.weekly_min as number) ?? DEFAULT_WEEKLY_MIN;
    const members_ = userIds.map((uid) => {
      const p = profileById.get(uid);
      const points = Math.max(
        0,
        (earned.get(uid) ?? 0) - (spent.get(uid) ?? 0) + (adjusted.get(uid) ?? 0),
      );
      const l = linkByUser.get(uid);
      return {
        user_id: uid,
        username: (p?.username as string | null) ?? null,
        avatar_url: (p?.avatar_url as string | null) ?? null,
        account_type: (p?.account_type as string) ?? "fan",
        points,
        weekly_min: min,
        last_deduction_at: lastAdjust.get(uid) ?? null,
        is_me: uid === context.userId,
        spotify_artist_url: (l?.spotify_artist_url as string | null) ?? null,
        spotify_artist_name: (l?.spotify_artist_name as string | null) ?? null,
        track_url: (l?.track_url as string | null) ?? null,
        track_name: (l?.track_name as string | null) ?? null,
        track2_url: (l?.track2_url as string | null) ?? null,
        track2_name: (l?.track2_name as string | null) ?? null,
        track3_url: (l?.track3_url as string | null) ?? null,
        track3_name: (l?.track3_name as string | null) ?? null,
        track4_url: (l?.track4_url as string | null) ?? null,
        track4_name: (l?.track4_name as string | null) ?? null,
        track5_url: (l?.track5_url as string | null) ?? null,
        track5_name: (l?.track5_name as string | null) ?? null,
        lastfm_username: lastfmByUser.get(uid) ?? null,
      };
    });

    return {
      playlist: {
        id: pl.id as string,
        roomId: room.id as string,
        name: pl.name as string,
        imageUrl: (pl.image_url as string | null) ?? null,
        spotifyPlaylistId: pl.spotify_playlist_id as string,
        weeklyMin: min,
        trackCount: trackIds.length,
        isTeam: (pl.is_team as boolean | null) ?? false,
      },
      trackingStartedAt: (activeTracking?.started_at as string | null) ?? null,
      isOwner,
      members: members_,
    };
  });

export const setBetaPlaylistWeeklyMin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; min: number }) => ({
    playlistId: String(data?.playlistId ?? ""),
    min: Math.max(0, Math.min(100000, Math.round(Number(data?.min) || 0))),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pl, room } = await loadPlaylist(supabaseAdmin, data.playlistId);
    if (room.owner_id !== context.userId) throw new Error("Only the room owner can do that");
    await supabaseAdmin
      .from("beta_room_playlists")
      .update({ weekly_min: data.min })
      .eq("id", pl.id);
    return { ok: true, min: data.min };
  });

export const adjustBetaPlaylistPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; userId: string; delta: number; reason?: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
    userId: String(data?.userId ?? ""),
    delta: Math.round(Number(data?.delta) || 0),
    reason: String(data?.reason ?? "").slice(0, 300),
  }))
  .handler(async ({ context, data }) => {
    if (data.delta === 0) throw new Error("Enter a number of points");
    if (Math.abs(data.delta) > 100000) throw new Error("That adjustment is too large");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pl, room } = await loadPlaylist(supabaseAdmin, data.playlistId);
    if (room.owner_id !== context.userId) throw new Error("Only the room owner can adjust points");
    if (data.delta > 0 && !((pl as any).is_team ?? false))
      throw new Error("Points can only be added on team playlists");

    const { data: member } = await supabaseAdmin
      .from("beta_room_members")
      .select("id")
      .eq("room_id", room.id)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!member) throw new Error("That user is not a member of this room");

    const { error } = await supabaseAdmin.from("beta_point_adjustments").insert({
      room_id: room.id,
      playlist_id: pl.id,
      user_id: data.userId,
      curator_id: context.userId,
      delta: data.delta,
      reason: data.reason || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeBetaRoomMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; userId: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
    userId: String(data?.userId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { room } = await loadPlaylist(supabaseAdmin, data.playlistId);
    if (room.owner_id !== context.userId)
      throw new Error("Only the room owner can remove members");
    if (data.userId === room.owner_id) throw new Error("You can't remove the room owner");

    const { error } = await supabaseAdmin
      .from("beta_room_members")
      .delete()
      .eq("room_id", room.id)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setBetaPlaylistMemberLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      playlistId: string;
      userId: string;
      spotifyArtistUrl?: string | null;
      spotifyArtistName?: string | null;
      trackUrl?: string | null;
      trackName?: string | null;
      track2Url?: string | null;
      track2Name?: string | null;
      track3Url?: string | null;
      track3Name?: string | null;
      track4Url?: string | null;
      track4Name?: string | null;
      track5Url?: string | null;
      track5Name?: string | null;
    }) => ({
      playlistId: String(data?.playlistId ?? ""),
      userId: String(data?.userId ?? ""),
      spotifyArtistUrl: data?.spotifyArtistUrl ? String(data.spotifyArtistUrl).slice(0, 2048) : null,
      spotifyArtistName: data?.spotifyArtistName ? String(data.spotifyArtistName).slice(0, 300) : null,
      trackUrl: data?.trackUrl ? String(data.trackUrl).slice(0, 2048) : null,
      trackName: data?.trackName ? String(data.trackName).slice(0, 300) : null,
      track2Url: data?.track2Url ? String(data.track2Url).slice(0, 2048) : null,
      track2Name: data?.track2Name ? String(data.track2Name).slice(0, 300) : null,
      track3Url: data?.track3Url ? String(data.track3Url).slice(0, 2048) : null,
      track3Name: data?.track3Name ? String(data.track3Name).slice(0, 300) : null,
      track4Url: data?.track4Url ? String(data.track4Url).slice(0, 2048) : null,
      track4Name: data?.track4Name ? String(data.track4Name).slice(0, 300) : null,
      track5Url: data?.track5Url ? String(data.track5Url).slice(0, 2048) : null,
      track5Name: data?.track5Name ? String(data.track5Name).slice(0, 300) : null,
    }),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pl, room } = await loadPlaylist(supabaseAdmin, data.playlistId);
    if (room.owner_id !== context.userId)
      throw new Error("Only the room owner can set member links");

    const { error } = await supabaseAdmin
      .from("beta_playlist_member_links")
      .upsert(
        {
          playlist_id: pl.id,
          user_id: data.userId,
          spotify_artist_url: data.spotifyArtistUrl || null,
          spotify_artist_name: data.spotifyArtistName || null,
          track_url: data.trackUrl || null,
          track_name: data.trackName || null,
          track2_url: data.track2Url || null,
          track2_name: data.track2Name || null,
          track3_url: data.track3Url || null,
          track3_name: data.track3Name || null,
          track4_url: data.track4Url || null,
          track4_name: data.track4Name || null,
          track5_url: data.track5Url || null,
          track5_name: data.track5Name || null,
        } as any,
        { onConflict: "playlist_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

