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
    .select("id, room_id, name, image_url, weekly_min, spotify_playlist_id")
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

    const [{ data: members }, { data: tracks }, { data: subs }, { data: adjustments }, { data: links }] =
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
            "user_id, spotify_artist_url, spotify_artist_name, track_url, track_name, track2_url, track2_name",
          )
          .eq("playlist_id", pl.id),
      ]);

    const userIds = Array.from(new Set((members ?? []).map((m: any) => m.user_id as string)));
    const trackIds = Array.from(
      new Set((tracks ?? []).map((t: any) => t.spotify_track_id as string)),
    );

    const earned = new Map<string, number>();
    if (userIds.length && trackIds.length) {
      const { data: plays } = await supabaseAdmin
        .from("beta_stream_points")
        .select("user_id, spotify_track_id")
        .eq("room_id", room.id)
        .in("user_id", userIds)
        .in("spotify_track_id", trackIds);
      for (const p of plays ?? []) {
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
      },
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
    if (data.delta >= 0) throw new Error("Only point removals are allowed");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pl, room } = await loadPlaylist(supabaseAdmin, data.playlistId);
    if (room.owner_id !== context.userId) throw new Error("Only the room owner can remove points");

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
    }) => ({
      playlistId: String(data?.playlistId ?? ""),
      userId: String(data?.userId ?? ""),
      spotifyArtistUrl: data?.spotifyArtistUrl ? String(data.spotifyArtistUrl).slice(0, 2048) : null,
      spotifyArtistName: data?.spotifyArtistName ? String(data.spotifyArtistName).slice(0, 300) : null,
      trackUrl: data?.trackUrl ? String(data.trackUrl).slice(0, 2048) : null,
      trackName: data?.trackName ? String(data.trackName).slice(0, 300) : null,
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
        },
        { onConflict: "playlist_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

