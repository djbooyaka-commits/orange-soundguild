import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Per-playlist "rooms" inside a Last.fm stream room.
 * Each curator playlist gets its own OSG-Artists-style roster of every member
 * of the room, with points earned on that playlist, a weekly minimum and
 * curator-only point removals.
 */

const DEFAULT_WEEKLY_MIN = 600;
/** Unused points expire after this many days. */
const POINT_TTL_DAYS = 30;

async function loadPlaylist(supabaseAdmin: any, playlistId: string) {
  const { data: pl } = await supabaseAdmin
    .from("beta_room_playlists")
    .select("id, room_id, name, image_url, weekly_min, spotify_playlist_id, is_team, min_period_days")
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

/**
 * Playlist IDs in a room where the current user has an open tracking session.
 * Used to highlight those tabs so users remember which playlist to stop.
 */
export const getMyActiveBetaTrackingPlaylists = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string }) => ({
    roomId: String(data?.roomId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sessions } = await supabaseAdmin
      .from("beta_playlist_tracking_sessions")
      .select("playlist_id, beta_room_playlists!inner(room_id)")
      .eq("user_id", context.userId)
      .is("stopped_at", null);
    return {
      playlistIds: Array.from(
        new Set(
          (sessions ?? [])
            .filter((s: any) => s?.beta_room_playlists?.room_id === data.roomId)
            .map((s: any) => s.playlist_id as string),
        ),
      ),
    };
  });


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

    // Unused points expire after 30 days, so spends and curator removals older
    // than the window no longer count against the current balance.
    const cutoff = new Date(Date.now() - POINT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: roomMembers },
      { data: removals },
      { data: tracks },
      { data: subs },
      { data: adjustments },
      { data: links },
      { data: activeTracking },
    ] =
      await Promise.all([
        supabaseAdmin.from("beta_room_members").select("user_id, created_at").eq("room_id", room.id),
        supabaseAdmin
          .from("beta_playlist_member_removals")
          .select("user_id")
          .eq("playlist_id", pl.id),
        supabaseAdmin
          .from("beta_room_tracks")
          .select("spotify_track_id")
          .eq("playlist_id", pl.id),
        supabaseAdmin
          .from("beta_submissions")
          .select("submitter_user_id, cost_points")
          .eq("playlist_id", pl.id)
          .gte("created_at", cutoff),
        supabaseAdmin
          .from("beta_point_adjustments")
          .select("user_id, delta, created_at")
          .eq("playlist_id", pl.id)
          .gte("created_at", cutoff),
        supabaseAdmin
          .from("beta_playlist_member_links")
          .select(
            "user_id, spotify_artist_url, spotify_artist_name, facebook_url, facebook_name, track_url, track_name, track2_url, track2_name, track3_url, track3_name, track4_url, track4_name, track5_url, track5_name",
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

    // Members removed from this playlist stay in the room's other playlists.
    const removedIds = new Set((removals ?? []).map((r: any) => r.user_id as string));
    const members = (roomMembers ?? []).filter((m: any) => !removedIds.has(m.user_id));
    const userIds = Array.from(new Set(members.map((m: any) => m.user_id as string)));
    const joinedByUser = new Map<string, string>(
      members.map((m: any) => [m.user_id as string, m.created_at as string]),
    );
    let removedList: { user_id: string; username: string | null }[] = [];
    if (isOwner && removedIds.size) {
      const ids = Array.from(removedIds).filter((id) =>
        (roomMembers ?? []).some((m: any) => m.user_id === id),
      );
      if (ids.length) {
        const { data: rp } = await supabaseAdmin.from("profiles").select("id, username").in("id", ids);
        removedList = (rp ?? []).map((p: any) => ({ user_id: p.id, username: p.username }));
      }
    }
    const trackIds = Array.from(
      new Set((tracks ?? []).map((t: any) => t.spotify_track_id as string)),
    );

    const earned = new Map<string, number>();
    if (userIds.length) {
      // Aggregate in SQL: counting client-side truncated at the API row limit
      // once a playlist had thousands of plays, which zeroed out totals.
      const { data: rows } = await supabaseAdmin.rpc("beta_playlist_earned_points", {
        p_playlist_id: pl.id,
      });
      const memberSet = new Set(userIds);
      for (const r of (rows ?? []) as any[]) {
        if (!memberSet.has(r.user_id as string)) continue;
        earned.set(r.user_id as string, Number(r.points) || 0);
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
      if ((a.delta ?? 0) < 0) {
        const prev = lastAdjust.get(uid);
        if (!prev || new Date(a.created_at as string) > new Date(prev)) {
          lastAdjust.set(uid, a.created_at as string);
        }
      }
    }

    const { data: profiles } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, username, avatar_url, account_type, facebook_url, facebook_name")
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
        streamed_points: earned.get(uid) ?? 0,
        weekly_min: min,
        last_deduction_at: lastAdjust.get(uid) ?? null,
        is_me: uid === context.userId,
        spotify_artist_url: (l?.spotify_artist_url as string | null) ?? null,
        spotify_artist_name: (l?.spotify_artist_name as string | null) ?? null,
        facebook_url: isOwner
          ? ((p as any)?.facebook_url as string | null) ?? (l?.facebook_url as string | null) ?? null
          : null,
        facebook_name: isOwner
          ? ((p as any)?.facebook_name as string | null) ?? (l?.facebook_name as string | null) ?? null
          : null,
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
        joined_at: joinedByUser.get(uid) ?? null,
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
        periodDays: ((pl as any).min_period_days as number | null) ?? 7,
      },
      removedMembers: isOwner ? removedList : [],
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

    const { data: member } = await supabaseAdmin
      .from("beta_room_members")
      .select("id")
      .eq("room_id", room.id)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!member) throw new Error("That user is not a member of this room");

    let appliedDelta = data.delta;
    if (data.delta < 0) {
      const cutoff = new Date(Date.now() - POINT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const [{ data: earnedRows }, { data: submissions }, { data: adjustments }] =
        await Promise.all([
          supabaseAdmin.rpc("beta_playlist_earned_points", { p_playlist_id: pl.id }),
          supabaseAdmin
            .from("beta_submissions")
            .select("cost_points")
            .eq("playlist_id", pl.id)
            .eq("submitter_user_id", data.userId)
            .gte("created_at", cutoff),
          supabaseAdmin
            .from("beta_point_adjustments")
            .select("delta")
            .eq("playlist_id", pl.id)
            .eq("user_id", data.userId)
            .gte("created_at", cutoff),
        ]);
      const earned = ((earnedRows ?? []) as any[]).find(
        (row) => row.user_id === data.userId,
      );
      const earnedPoints = Number(earned?.points) || 0;
      const spentPoints = (submissions ?? []).reduce(
        (sum: number, row: any) => sum + (Number(row.cost_points) || 0),
        0,
      );
      const adjustedPoints = (adjustments ?? []).reduce(
        (sum: number, row: any) => sum + (Number(row.delta) || 0),
        0,
      );
      const availablePoints = Math.max(0, earnedPoints - spentPoints + adjustedPoints);
      appliedDelta = -Math.min(Math.abs(data.delta), availablePoints);
      if (appliedDelta === 0) throw new Error("This member has no points to remove");
    }

    const { error } = await supabaseAdmin.from("beta_point_adjustments").insert({
      room_id: room.id,
      playlist_id: pl.id,
      user_id: data.userId,
      curator_id: context.userId,
      delta: appliedDelta,
      reason: data.reason || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true, appliedDelta };
  });

export const removeBetaRoomMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; userId: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
    userId: String(data?.userId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pl, room } = await loadPlaylist(supabaseAdmin, data.playlistId);
    if (room.owner_id !== context.userId)
      throw new Error("Only the room owner can remove members");
    if (data.userId === room.owner_id) throw new Error("You can't remove the room owner");

    // Playlist-scoped removal: the member stays in the room's other playlists.
    const { error } = await supabaseAdmin
      .from("beta_playlist_member_removals")
      .upsert(
        { playlist_id: pl.id, user_id: data.userId, removed_by: context.userId },
        { onConflict: "playlist_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const readdBetaRoomMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; userId: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
    userId: String(data?.userId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pl, room } = await loadPlaylist(supabaseAdmin, data.playlistId);
    if (room.owner_id !== context.userId) throw new Error("Only the room owner can do that");
    const { error } = await supabaseAdmin
      .from("beta_playlist_member_removals")
      .delete()
      .eq("playlist_id", pl.id)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addBetaPlaylistMemberByUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; username: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
    username: String(data?.username ?? "").trim().replace(/^@/, "").slice(0, 100),
  }))
  .handler(async ({ context, data }) => {
    if (!data.username) throw new Error("Enter a username");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pl, room } = await loadPlaylist(supabaseAdmin, data.playlistId);
    if (room.owner_id !== context.userId) throw new Error("Only the room owner can do that");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .ilike("username", data.username)
      .limit(1)
      .maybeSingle();
    if (!prof) throw new Error(`No user named @${data.username}`);
    const { data: existing } = await supabaseAdmin
      .from("beta_room_members")
      .select("id")
      .eq("room_id", room.id)
      .eq("user_id", prof.id)
      .maybeSingle();
    if (!existing) {
      const { error } = await supabaseAdmin
        .from("beta_room_members")
        .insert({ room_id: room.id, user_id: prof.id });
      if (error) throw new Error(error.message);
    }
    await supabaseAdmin
      .from("beta_playlist_member_removals")
      .delete()
      .eq("playlist_id", pl.id)
      .eq("user_id", prof.id);
    return { ok: true, username: prof.username as string | null };
  });

export const setBetaPlaylistPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; days: number }) => ({
    playlistId: String(data?.playlistId ?? ""),
    days: Number(data?.days) === 30 ? 30 : 7,
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pl, room } = await loadPlaylist(supabaseAdmin, data.playlistId);
    if (room.owner_id !== context.userId) throw new Error("Only the room owner can do that");
    const { error } = await (supabaseAdmin as any)
      .from("beta_room_playlists")
      .update({ min_period_days: data.days })
      .eq("id", pl.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Room owner (curator) can correct the date a member joined the room. */
export const setBetaRoomMemberJoinedAt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; userId: string; joinedAt: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
    userId: String(data?.userId ?? ""),
    joinedAt: String(data?.joinedAt ?? "").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!data.joinedAt) throw new Error("Pick a date");
    const when = new Date(`${data.joinedAt}T12:00:00Z`);
    if (Number.isNaN(when.getTime())) throw new Error("That date isn't valid");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { room } = await loadPlaylist(supabaseAdmin, data.playlistId);
    if (room.owner_id !== context.userId)
      throw new Error("Only the room owner can change joined dates");

    const { error } = await supabaseAdmin
      .from("beta_room_members")
      .update({ created_at: when.toISOString() })
      .eq("room_id", room.id)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true, joinedAt: when.toISOString() };
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


export type BetaPointEvent = {
  id: string;
  user_id: string;
  username: string | null;
  delta: number;
  reason: string | null;
  created_at: string;
};

/** Recent curator point gifts/removals on a Last.fm playlist room (owner only). */
export const betaPlaylistPointHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pl, room } = await loadPlaylist(supabaseAdmin, data.playlistId);
    if (room.owner_id !== context.userId)
      throw new Error("Only the room owner can view point history");

    const { data: rows, error } = await supabaseAdmin
      .from("beta_point_adjustments")
      .select("id, user_id, delta, reason, created_at")
      .eq("playlist_id", pl.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const names = new Map<string, string | null>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, username")
        .in("id", ids);
      (profs ?? []).forEach((p: any) => names.set(p.id, p.username));
    }
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      username: names.get(r.user_id) ?? null,
      delta: r.delta,
      reason: r.reason,
      created_at: r.created_at,
    })) as BetaPointEvent[];
  });

const FB_RE = /^https?:\/\/([a-z0-9-]+\.)*(facebook\.com|fb\.me|fb\.watch)\//i;

/** Room owner sets a member's Facebook link + display name on their card. */
export const setBetaPlaylistMemberFacebook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; userId: string; url?: string; name?: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
    userId: String(data?.userId ?? ""),
    url: String(data?.url ?? "").trim().slice(0, 500),
    name: String(data?.name ?? "").trim().slice(0, 200),
  }))
  .handler(async ({ context, data }) => {
    if (data.url && !FB_RE.test(data.url)) throw new Error("Enter a valid Facebook link");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pl, room } = await loadPlaylist(supabaseAdmin, data.playlistId);
    if (room.owner_id !== context.userId)
      throw new Error("Only the room owner can set Facebook links");

    // Stored once on the member's profile so it shows on every playlist tab/room.
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        facebook_url: data.url || null,
        facebook_name: data.name || null,
      } as any)
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type BetaTrackingSession = {
  user_id: string;
  username: string | null;
  sessions: { id: string; started_at: string; stopped_at: string | null; points: number }[];
};

/** Per-member start/stop tracking times for the last 7 days on this playlist. */
export const betaPlaylistTrackingSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pl, room } = await loadPlaylist(supabaseAdmin, data.playlistId);
    await assertRoomMember(supabaseAdmin, room, context.userId);
    // Members only see their own sessions; the room owner (curator) sees everyone.
    const isOwner = room.owner_id === context.userId;

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    let query = supabaseAdmin
      .from("beta_playlist_tracking_sessions")
      .select("id, user_id, started_at, stopped_at")
      .eq("playlist_id", pl.id)
      .gte("started_at", since);
    if (!isOwner) query = query.eq("user_id", context.userId);
    const { data: rows, error } = await query
      .order("started_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id as string)));
    let names = new Map<string, string | null>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, username")
        .in("id", ids);
      names = new Map((profs ?? []).map((p: any) => [p.id as string, p.username as string | null]));
    }

    // Points earned per session: plays on this playlist between start and stop.
    let pointsQuery = supabaseAdmin
      .from("beta_stream_points")
      .select("user_id, played_at")
      .eq("playlist_id", pl.id)
      .gte("played_at", since);
    if (!isOwner) pointsQuery = pointsQuery.eq("user_id", context.userId);
    const { data: pointRows } = await pointsQuery.limit(20000);
    const pointsByUser = new Map<string, number[]>();
    (pointRows ?? []).forEach((r: any) => {
      if (!pointsByUser.has(r.user_id)) pointsByUser.set(r.user_id, []);
      pointsByUser.get(r.user_id)!.push(new Date(r.played_at).getTime());
    });

    const now = Date.now();
    const byUser = new Map<
      string,
      { id: string; started_at: string; stopped_at: string | null; points: number }[]
    >();
    (rows ?? []).forEach((r: any) => {
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
      const startMs = new Date(r.started_at).getTime();
      const stopMs = r.stopped_at ? new Date(r.stopped_at).getTime() : now;
      const plays = pointsByUser.get(r.user_id) ?? [];
      const points = plays.filter((t) => t >= startMs && t <= stopMs).length;
      byUser.get(r.user_id)!.push({
        id: r.id, started_at: r.started_at,
        stopped_at: r.stopped_at,
        points,
      });
    });

    return Array.from(byUser.entries())
      .map(([uid, sessions]) => ({
        user_id: uid,
        username: names.get(uid) ?? null,
        sessions,
      }))
      .sort((a, b) => b.sessions.length - a.sessions.length) as BetaTrackingSession[];
  });

/** Curator-managed links shown together in one named room tab. */
export const listBetaRoomLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string }) => ({
    roomId: String(data?.roomId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin
      .from("beta_rooms")
      .select("id, owner_id, links_tab_name")
      .eq("id", data.roomId)
      .maybeSingle();
    if (!room) throw new Error("Room not found");
    await assertRoomMember(supabaseAdmin, room, context.userId);
    const { data: rows, error } = await context.supabase
      .from("beta_room_links")
      .select("id, name, url, position, created_at")
      .eq("room_id", data.roomId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { tabName: room.links_tab_name, links: rows ?? [] };
  });

export const setBetaRoomLinksTabName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string; name: string }) => ({
    roomId: String(data?.roomId ?? ""),
    name: String(data?.name ?? "").trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!data.name || data.name.length > 60) throw new Error("Tab name must be 1–60 characters");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin.from("beta_rooms")
      .select("owner_id").eq("id", data.roomId).maybeSingle();
    if (!room || room.owner_id !== context.userId) throw new Error("Only the curator can rename this tab");
    const { error } = await supabaseAdmin.from("beta_rooms")
      .update({ links_tab_name: data.name }).eq("id", data.roomId).eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addBetaRoomLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string; name: string; url: string }) => ({
    roomId: String(data?.roomId ?? ""),
    name: String(data?.name ?? "").trim().slice(0, 60),
    url: String(data?.url ?? "").trim().slice(0, 500),
  }))
  .handler(async ({ context, data }) => {
    if (!data.name) throw new Error("Give the link a name");
    let url = data.url;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      new URL(url);
    } catch {
      throw new Error("That link doesn't look valid");
    }
    const { error } = await context.supabase
      .from("beta_room_links")
      .insert({ room_id: data.roomId, name: data.name, url });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBetaRoomLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { linkId: string }) => ({
    linkId: String(data?.linkId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("beta_room_links")
      .delete()
      .eq("id", data.linkId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Give a sorry/compensation bonus to every member of every Last.fm room the
// caller owns (admins: every room), on each playlist in that room.
export const grantBetaPointsToAllUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { points: number; reason?: string }) => ({
    points: Math.round(Number(data?.points) || 0),
    reason: String(data?.reason ?? "").slice(0, 300),
  }))
  .handler(async ({ context, data }) => {
    if (data.points < 1 || data.points > 10000) throw new Error("Enter between 1 and 10000 points");
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let roomsQ = supabaseAdmin.from("beta_rooms").select("id, owner_id");
    if (!isAdmin) roomsQ = roomsQ.eq("owner_id", context.userId);
    const { data: rooms } = await roomsQ;
    const roomIds = (rooms ?? []).map((r: any) => r.id);
    if (roomIds.length === 0) throw new Error("You don't own any Last.fm rooms");
    const ownerByRoom = new Map((rooms ?? []).map((r: any) => [r.id, r.owner_id]));
    const [{ data: members }, { data: playlists }] = await Promise.all([
      supabaseAdmin.from("beta_room_members").select("room_id, user_id").in("room_id", roomIds),
      supabaseAdmin.from("beta_room_playlists").select("id, room_id").in("room_id", roomIds),
    ]);
    const rows: any[] = [];
    const users = new Set<string>();
    for (const m of (members ?? []) as any[]) {
      for (const p of ((playlists ?? []) as any[]).filter((p) => p.room_id === m.room_id)) {
        users.add(m.user_id);
        rows.push({
          room_id: m.room_id,
          playlist_id: p.id,
          user_id: m.user_id,
          curator_id: ownerByRoom.get(m.room_id),
          delta: data.points,
          reason: data.reason || "Tracking compensation",
        });
      }
    }
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabaseAdmin.from("beta_point_adjustments").insert(rows.slice(i, i + 500));
      if (error) throw new Error(error.message);
    }
    return { users: users.size, grants: rows.length };
  });
