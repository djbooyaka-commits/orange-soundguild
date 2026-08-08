import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * BETA stream tracker rooms — an isolated sandbox.
 * Difference from the live tracker: a play counts wherever it was played from
 * (no playlist-context requirement), which is what free Spotify accounts can do.
 */

export const listBetaRooms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rooms } = await supabaseAdmin
      .from("beta_rooms")
      .select("id, owner_id, name, description, created_at")
      .order("created_at", { ascending: false });

    const { data: memberships } = await supabaseAdmin
      .from("beta_room_members")
      .select("room_id")
      .eq("user_id", context.userId);
    const joined = new Set((memberships ?? []).map((m: any) => m.room_id));

    const { data: myPoints } = await supabaseAdmin
      .from("beta_stream_points")
      .select("room_id")
      .eq("user_id", context.userId);
    const pointsByRoom = new Map<string, number>();
    for (const p of myPoints ?? []) {
      pointsByRoom.set(p.room_id, (pointsByRoom.get(p.room_id) ?? 0) + 1);
    }

    // Invite-only: you only see rooms you own or have been invited into.
    return (rooms ?? [])
      .filter((r: any) => r.owner_id === context.userId || joined.has(r.id))
      .map((r: any) => ({
        id: r.id as string,
        name: r.name as string,
        description: (r.description as string | null) ?? null,
        isOwner: r.owner_id === context.userId,
        joined: joined.has(r.id) || r.owner_id === context.userId,
        myPoints: pointsByRoom.get(r.id) ?? 0,
      }));

  });

export const createBetaRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string; description?: string }) => {
    const name = String(data?.name ?? "").trim();
    if (name.length < 2 || name.length > 80) throw new Error("Room name must be 2–80 characters");
    const description = String(data?.description ?? "").trim().slice(0, 500);
    return { name, description };
  })
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("beta_rooms")
      .insert({
        owner_id: context.userId,
        name: data.name,
        description: data.description || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteBetaRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string }) => ({ roomId: String(data?.roomId ?? "") }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("beta_rooms")
      .delete()
      .eq("id", data.roomId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const joinBetaRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string }) => ({ roomId: String(data?.roomId ?? "") }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("beta_room_members")
      .upsert(
        { room_id: data.roomId, user_id: context.userId },
        { onConflict: "room_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const leaveBetaRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string }) => ({ roomId: String(data?.roomId ?? "") }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("beta_room_members")
      .delete()
      .eq("room_id", data.roomId)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const getBetaRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string }) => ({ roomId: String(data?.roomId ?? "") }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin
      .from("beta_rooms")
      .select("id, owner_id, name, description")
      .eq("id", data.roomId)
      .maybeSingle();
    if (!room) throw new Error("Room not found");

    const { data: member } = await supabaseAdmin
      .from("beta_room_members")
      .select("id, last_polled_at")
      .eq("room_id", data.roomId)
      .eq("user_id", context.userId)
      .maybeSingle();

    const isOwner = room.owner_id === context.userId;
    const joined = isOwner || !!member;

    const { data: tracks } = joined
      ? await supabaseAdmin
          .from("beta_room_tracks")
          .select("id, spotify_track_id, track_name, artist_name")
          .eq("room_id", data.roomId)
          .order("created_at", { ascending: true })
      : { data: [] as any[] };

    const { data: points } = await supabaseAdmin
      .from("beta_stream_points")
      .select("user_id, spotify_track_id, spotify_track_name, played_at, source")
      .eq("room_id", data.roomId)
      .order("played_at", { ascending: false })
      .limit(200);

    const all = points ?? [];
    const mine = all.filter((p: any) => p.user_id === context.userId);

    // Leaderboard (owner view)
    let leaderboard: Array<{ userId: string; username: string | null; points: number }> = [];
    if (isOwner) {
      const counts = new Map<string, number>();
      for (const p of all) counts.set(p.user_id, (counts.get(p.user_id) ?? 0) + 1);
      const ids = Array.from(counts.keys());
      const { data: profiles } = ids.length
        ? await supabaseAdmin.from("profiles").select("id, username").in("id", ids)
        : { data: [] as any[] };
      const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.username]));
      leaderboard = ids
        .map((id) => ({ userId: id, username: nameById.get(id) ?? null, points: counts.get(id)! }))
        .sort((a, b) => b.points - a.points);
    }

    return {
      id: room.id as string,
      name: room.name as string,
      description: (room.description as string | null) ?? null,
      isOwner,
      joined,
      lastPolledAt: (member?.last_polled_at as string | null) ?? null,
      tracks: (tracks ?? []).map((t: any) => ({
        id: t.id as string,
        spotifyTrackId: t.spotify_track_id as string,
        name: (t.track_name as string | null) ?? null,
        artist: (t.artist_name as string | null) ?? null,
      })),
      myPoints: mine.length,
      recent: mine.slice(0, 25).map((p: any) => ({
        trackId: p.spotify_track_id as string,
        name: (p.spotify_track_name as string | null) ?? null,
        playedAt: p.played_at as string,
        source: (p.source as string | null) ?? null,
      })),
      leaderboard,
    };
  });

export const addBetaRoomTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string; url: string }) => ({
    roomId: String(data?.roomId ?? ""),
    url: String(data?.url ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { parseSpotifyTrackId, getBetaAccessToken } = await import("./beta-spotify.server");

    const { data: room } = await supabaseAdmin
      .from("beta_rooms")
      .select("owner_id")
      .eq("id", data.roomId)
      .maybeSingle();
    if (!room || room.owner_id !== context.userId) throw new Error("Only the room owner can add tracks");

    const trackId = parseSpotifyTrackId(data.url);
    if (!trackId) throw new Error("Paste a Spotify track link (open.spotify.com/track/…)");

    let name: string | null = null;
    let artist: string | null = null;
    try {
      const token = await getBetaAccessToken(context.userId, supabaseAdmin);
      if (token) {
        const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const t = await res.json();
          name = t.name ?? null;
          artist = (t.artists ?? []).map((a: any) => a.name).join(", ") || null;
        }
      }
    } catch {
      /* metadata is optional */
    }

    const { error } = await supabaseAdmin.from("beta_room_tracks").upsert(
      { room_id: data.roomId, spotify_track_id: trackId, track_name: name, artist_name: artist },
      { onConflict: "room_id,spotify_track_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, trackId, name, artist };
  });

export const removeBetaRoomTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string; trackRowId: string }) => ({
    roomId: String(data?.roomId ?? ""),
    trackRowId: String(data?.trackRowId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin
      .from("beta_rooms")
      .select("owner_id")
      .eq("id", data.roomId)
      .maybeSingle();
    if (!room || room.owner_id !== context.userId) throw new Error("Only the room owner can remove tracks");
    await supabaseAdmin.from("beta_room_tracks").delete().eq("id", data.trackRowId).eq("room_id", data.roomId);
    return { ok: true };
  });

/**
 * Sync the caller's recently-played into this beta room.
 * Counts a play if the track is on the room's watch list — regardless of
 * whether it came from a playlist, album, radio, search or Liked Songs.
 */
export const syncBetaRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string }) => ({ roomId: String(data?.roomId ?? "") }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getBetaAccessToken, fetchRecentlyPlayed } = await import("./beta-spotify.server");

    const { data: room } = await supabaseAdmin
      .from("beta_rooms")
      .select("id, owner_id")
      .eq("id", data.roomId)
      .maybeSingle();
    if (!room) throw new Error("Room not found");

    const { data: member } = await supabaseAdmin
      .from("beta_room_members")
      .select("id, last_polled_at")
      .eq("room_id", data.roomId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member && room.owner_id !== context.userId) throw new Error("Join this room first");

    const token = await getBetaAccessToken(context.userId, supabaseAdmin);
    if (!token) return { added: 0, connected: false, error: null as string | null };

    const OVERLAP_MS = 15 * 60 * 1000;
    const after = member?.last_polled_at
      ? new Date(member.last_polled_at).getTime() - OVERLAP_MS
      : Date.now() - 24 * 60 * 60 * 1000;

    const { items, error } = await fetchRecentlyPlayed(token, after);
    if (error) return { added: 0, connected: true, error };

    const { data: watch } = await supabaseAdmin
      .from("beta_room_tracks")
      .select("spotify_track_id")
      .eq("room_id", data.roomId);
    const watched = new Set((watch ?? []).map((t: any) => t.spotify_track_id));

    let added = 0;
    let matched = 0;
    let maxPlayedAt: number | null = null;

    for (const item of items) {
      const playedAtMs = new Date(item.played_at).getTime();
      maxPlayedAt = Math.max(maxPlayedAt ?? 0, playedAtMs);
      const track = item.track;
      if (!track?.id || !watched.has(track.id)) continue;
      matched++;
      const { error: insErr } = await supabaseAdmin.from("beta_stream_points").insert({
        room_id: data.roomId,
        user_id: context.userId,
        spotify_track_id: track.id,
        spotify_track_name: track.name ?? null,
        played_at: item.played_at,
        source: item.context?.type ?? "unknown",
      });
      if (!insErr) added += 1;
    }

    if (maxPlayedAt != null && member) {
      await supabaseAdmin
        .from("beta_room_members")
        .update({ last_polled_at: new Date(maxPlayedAt).toISOString() })
        .eq("id", member.id);
    }

    return {
      added,
      connected: true,
      error: null as string | null,
      scanned: items.length,
      matched,
      watching: watched.size,
    };
  });
