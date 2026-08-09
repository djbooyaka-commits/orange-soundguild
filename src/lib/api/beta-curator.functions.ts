import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Curator features for the Last.fm stream tracker rooms:
 * playlists, invite link, point economy and track submissions.
 * Kept separate from the live Spotify curator system on purpose.
 */

const SUBMIT_COST = 50;
const MAX_SUBMISSIONS_PER_DAY = 2;

async function assertOwner(supabaseAdmin: any, roomId: string, userId: string) {
  const { data: room } = await supabaseAdmin
    .from("beta_rooms")
    .select("id, owner_id, invite_code, name")
    .eq("id", roomId)
    .maybeSingle();
  if (!room || room.owner_id !== userId) throw new Error("Only the room owner can do that");
  return room;
}

async function assertMember(supabaseAdmin: any, roomId: string, userId: string) {
  const { data: room } = await supabaseAdmin
    .from("beta_rooms")
    .select("id, owner_id, invite_code, name")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) throw new Error("Room not found");
  if (room.owner_id === userId) return room;
  const { data: member } = await supabaseAdmin
    .from("beta_room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) throw new Error("Join this room first");
  return room;
}

/**
 * Points are earned per playlist: a counted play only funds the playlist that
 * contains that track. Submitting spends the points permanently (no refund on
 * reject) for that playlist only.
 */
async function pointsByPlaylist(supabaseAdmin: any, roomId: string, userId: string) {
  const [{ data: tracks }, { data: plays }, { data: subs }, { data: pls }] = await Promise.all([
    supabaseAdmin
      .from("beta_room_tracks")
      .select("playlist_id, spotify_track_id")
      .eq("room_id", roomId),
    supabaseAdmin
      .from("beta_stream_points")
      .select("spotify_track_id")
      .eq("room_id", roomId)
      .eq("user_id", userId),
    supabaseAdmin
      .from("beta_submissions")
      .select("playlist_id, cost_points")
      .eq("room_id", roomId)
      .eq("submitter_user_id", userId),
    supabaseAdmin.from("beta_room_playlists").select("id").eq("room_id", roomId),
  ]);

  const byTrack = new Map<string, string[]>();
  for (const t of tracks ?? []) {
    if (!t.playlist_id) continue;
    const list = byTrack.get(t.spotify_track_id) ?? [];
    list.push(t.playlist_id as string);
    byTrack.set(t.spotify_track_id, list);
  }

  const earned = new Map<string, number>();
  for (const p of plays ?? []) {
    for (const pid of byTrack.get(p.spotify_track_id) ?? []) {
      earned.set(pid, (earned.get(pid) ?? 0) + 1);
    }
  }

  const spent = new Map<string, number>();
  for (const s of subs ?? []) {
    if (!s.playlist_id) continue;
    spent.set(s.playlist_id as string, (spent.get(s.playlist_id) ?? 0) + (s.cost_points ?? 0));
  }

  const ids = new Set<string>([
    ...(pls ?? []).map((p: any) => p.id as string),
    ...earned.keys(),
    ...spent.keys(),
  ]);
  const rows = [...ids].map((playlistId) => {
    const e = earned.get(playlistId) ?? 0;
    const s = spent.get(playlistId) ?? 0;
    return { playlistId, earned: e, spent: s, available: Math.max(0, e - s) };
  });
  return rows;
}

async function pointsForPlaylist(
  supabaseAdmin: any,
  roomId: string,
  userId: string,
  playlistId: string,
) {
  const rows = await pointsByPlaylist(supabaseAdmin, roomId, userId);
  return (
    rows.find((r) => r.playlistId === playlistId) ?? {
      playlistId,
      earned: 0,
      spent: 0,
      available: 0,
    }
  );
}


/* ----------------------------- invite link ----------------------------- */

export const getBetaRoomInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string }) => ({ roomId: String(data?.roomId ?? "") }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const room = await assertOwner(supabaseAdmin, data.roomId, context.userId);
    return { code: room.invite_code as string };
  });

export const joinBetaRoomByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { code: string }) => ({ code: String(data?.code ?? "").trim() }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: room } = await supabaseAdmin
      .from("beta_rooms")
      .select("id, owner_id, name")
      .eq("invite_code", data.code)
      .maybeSingle();
    if (!room) throw new Error("That invite link is not valid");
    if (room.owner_id !== context.userId) {
      const { error } = await supabaseAdmin
        .from("beta_room_members")
        .upsert({ room_id: room.id, user_id: context.userId }, { onConflict: "room_id,user_id" });
      if (error) throw new Error(error.message);
    }
    return { roomId: room.id as string, name: room.name as string };
  });

/* ------------------------------ playlists ------------------------------ */

export const listBetaRoomPlaylists = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string }) => ({ roomId: String(data?.roomId ?? "") }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertMember(supabaseAdmin, data.roomId, context.userId);
    const { data: rows } = await supabaseAdmin
      .from("beta_room_playlists")
      .select("id, spotify_playlist_id, name, image_url, track_hold_days, created_at")
      .eq("room_id", data.roomId)
      .order("created_at", { ascending: true });

    const ids = (rows ?? []).map((r: any) => r.id);
    const counts = new Map<string, number>();
    if (ids.length) {
      const { data: tracks } = await supabaseAdmin
        .from("beta_room_tracks")
        .select("playlist_id")
        .in("playlist_id", ids);
      for (const t of tracks ?? []) {
        const pid = (t as any).playlist_id as string | null;
        if (!pid) continue;
        counts.set(pid, (counts.get(pid) ?? 0) + 1);
      }
    }

    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      spotifyPlaylistId: r.spotify_playlist_id as string,
      name: r.name as string,
      imageUrl: (r.image_url as string | null) ?? null,
      holdDays: (r.track_hold_days as number) ?? 30,
      trackCount: counts.get(r.id) ?? 0,
    }));
  });

async function importPlaylistTracks(
  supabaseAdmin: any,
  roomId: string,
  playlistRowId: string,
  spotifyPlaylistId: string,
  ownerId: string,
) {
  const {
    getBetaAccessToken,
    getBetaAppToken,
    fetchBetaPlaylistTracks,
    fetchBetaPlaylistMeta,
    fetchBetaPublicPlaylistMeta,
    fetchBetaPublicPlaylistTracks,
  } = await import("./beta-spotify.server");

  const userToken = await getBetaAccessToken(ownerId, supabaseAdmin);
  const appToken = await getBetaAppToken();
  const candidates = [userToken, appToken].filter(Boolean) as string[];
  if (candidates.length === 0)
    throw new Error("Spotify is not configured — cannot read that playlist");

  let meta: { name: string; imageUrl: string | null } | null = null;
  let tracks: Array<{ id: string; name: string; artist: string }> = [];
  let lastError: string | null = null;

  for (const token of candidates) {
    const m = await fetchBetaPlaylistMeta(token, spotifyPlaylistId);
    if (m && !meta) meta = m;
    const r = await fetchBetaPlaylistTracks(token, spotifyPlaylistId);
    if (r.items.length > 0) {
      tracks = r.items;
      lastError = null;
      break;
    }
    lastError = r.error;
  }

  // Spotify's Web API currently rejects some otherwise-public playlists for both
  // user and app tokens. Its public embed still exposes the playlist's canonical
  // metadata and full track list, so use that read-only source as the fallback.
  if (tracks.length === 0) {
    meta = meta ?? (await fetchBetaPublicPlaylistMeta(spotifyPlaylistId));
    tracks = await fetchBetaPublicPlaylistTracks(spotifyPlaylistId);
    if (tracks.length > 0) lastError = null;
  }

  if (tracks.length === 0) {
    if (lastError === "spotify_403" || lastError === "spotify_401") {
      throw new Error(
        userToken
          ? "Spotify blocked reading that playlist. Reconnect the Spotify account that owns it, then sync again."
          : "Reading playlist tracks needs a connected Spotify account. Connect Spotify (the account that owns the playlist) and sync again.",
      );
    }

    if (lastError) throw new Error(`Spotify could not read that playlist (${lastError}).`);
    if (!meta) throw new Error("Could not read that playlist — make sure it is public");
    throw new Error("That playlist has no playable tracks on Spotify.");
  }

  if (meta) {
    await supabaseAdmin
      .from("beta_room_playlists")
      .update({ name: meta.name, image_url: meta.imageUrl })
      .eq("id", playlistRowId);
  }

  // Replace this playlist's tracked tracks with the current playlist contents.
  await supabaseAdmin.from("beta_room_tracks").delete().eq("playlist_id", playlistRowId);
  for (const t of tracks) {
    await supabaseAdmin.from("beta_room_tracks").upsert(
      {
        room_id: roomId,
        playlist_id: playlistRowId,
        spotify_track_id: t.id,
        track_name: t.name,
        artist_name: t.artist,
      },
      { onConflict: "room_id,spotify_track_id" },
    );
  }
  return { imported: tracks.length, name: meta?.name ?? null };
}

export const addBetaRoomPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string; url: string }) => ({
    roomId: String(data?.roomId ?? ""),
    url: String(data?.url ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwner(supabaseAdmin, data.roomId, context.userId);
    const { parseSpotifyPlaylistId } = await import("./beta-spotify.server");
    const playlistId = parseSpotifyPlaylistId(data.url);
    if (!playlistId) throw new Error("Paste a Spotify playlist link (open.spotify.com/playlist/…)");

    const { data: row, error } = await supabaseAdmin
      .from("beta_room_playlists")
      .upsert(
        { room_id: data.roomId, spotify_playlist_id: playlistId, name: "Playlist" },
        { onConflict: "room_id,spotify_playlist_id" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    try {
      const result = await importPlaylistTracks(
        supabaseAdmin,
        data.roomId,
        row.id as string,
        playlistId,
        context.userId,
      );
      return { ok: true, ...result };
    } catch (importError) {
      await supabaseAdmin.from("beta_room_playlists").delete().eq("id", row.id);
      throw importError;
    }
  });

export const syncBetaRoomPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pl } = await supabaseAdmin
      .from("beta_room_playlists")
      .select("id, room_id, spotify_playlist_id")
      .eq("id", data.playlistId)
      .maybeSingle();
    if (!pl) throw new Error("Playlist not found");
    await assertOwner(supabaseAdmin, pl.room_id as string, context.userId);
    const result = await importPlaylistTracks(
      supabaseAdmin,
      pl.room_id as string,
      pl.id as string,
      pl.spotify_playlist_id as string,
      context.userId,
    );
    return { ok: true, ...result };
  });

export const removeBetaRoomPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pl } = await supabaseAdmin
      .from("beta_room_playlists")
      .select("id, room_id")
      .eq("id", data.playlistId)
      .maybeSingle();
    if (!pl) return { ok: true };
    await assertOwner(supabaseAdmin, pl.room_id as string, context.userId);
    await supabaseAdmin.from("beta_room_playlists").delete().eq("id", pl.id);
    return { ok: true };
  });

export const setBetaPlaylistHoldDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; days: number }) => ({
    playlistId: String(data?.playlistId ?? ""),
    days: Math.max(0, Math.min(365, Math.round(Number(data?.days) || 0))),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pl } = await supabaseAdmin
      .from("beta_room_playlists")
      .select("id, room_id")
      .eq("id", data.playlistId)
      .maybeSingle();
    if (!pl) throw new Error("Playlist not found");
    await assertOwner(supabaseAdmin, pl.room_id as string, context.userId);
    await supabaseAdmin
      .from("beta_room_playlists")
      .update({ track_hold_days: data.days })
      .eq("id", pl.id);
    return { ok: true, days: data.days };
  });

/* ------------------------------- points -------------------------------- */

export const getBetaRoomPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string }) => ({ roomId: String(data?.roomId ?? "") }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertMember(supabaseAdmin, data.roomId, context.userId);
    const p = await pointsFor(supabaseAdmin, data.roomId, context.userId);
    return { ...p, cost: SUBMIT_COST, dailyLimit: MAX_SUBMISSIONS_PER_DAY };
  });

/* ----------------------------- submissions ----------------------------- */

export const submitBetaTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string; playlistId: string; url: string }) => ({
    roomId: String(data?.roomId ?? ""),
    playlistId: String(data?.playlistId ?? ""),
    url: String(data?.url ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const room = await assertMember(supabaseAdmin, data.roomId, context.userId);
    const { parseSpotifyTrackId, getBetaAppToken, getBetaAccessToken } =
      await import("./beta-spotify.server");

    const trackId = parseSpotifyTrackId(data.url);
    if (!trackId) throw new Error("Paste a Spotify track link (open.spotify.com/track/…)");

    const { data: pl } = await supabaseAdmin
      .from("beta_room_playlists")
      .select("id, room_id, track_hold_days, name")
      .eq("id", data.playlistId)
      .eq("room_id", data.roomId)
      .maybeSingle();
    if (!pl) throw new Error("Pick a playlist in this room");

    // Daily limit
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recent } = await supabaseAdmin
      .from("beta_submissions")
      .select("id", { count: "exact", head: true })
      .eq("room_id", data.roomId)
      .eq("submitter_user_id", context.userId)
      .gte("created_at", since);
    if ((recent ?? 0) >= MAX_SUBMISSIONS_PER_DAY) {
      throw new Error(`You can submit ${MAX_SUBMISSIONS_PER_DAY} tracks every 24 hours`);
    }

    // Hold window — same track can't come back too soon
    const holdDays = (pl.track_hold_days as number) ?? 30;
    if (holdDays > 0) {
      const holdSince = new Date(Date.now() - holdDays * 24 * 60 * 60 * 1000).toISOString();
      const { data: held } = await supabaseAdmin
        .from("beta_submissions")
        .select("id")
        .eq("playlist_id", pl.id)
        .eq("spotify_track_id", trackId)
        .eq("status", "approved")
        .gte("created_at", holdSince)
        .limit(1);
      if ((held ?? []).length > 0) {
        throw new Error(`That track was added within the last ${holdDays} days`);
      }
    }

    // Points
    const points = await pointsFor(supabaseAdmin, data.roomId, context.userId);
    if (points.available < SUBMIT_COST) {
      throw new Error(`You need ${SUBMIT_COST} points — you have ${points.available}`);
    }

    // Optional metadata
    let name: string | null = null;
    try {
      const token =
        (await getBetaAccessToken(context.userId, supabaseAdmin)) ?? (await getBetaAppToken());
      if (token) {
        const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const t = await res.json();
          const artists = (t.artists ?? []).map((a: any) => a.name).join(", ");
          name = artists ? `${t.name} — ${artists}` : (t.name ?? null);
        }
      }
    } catch {
      /* metadata is optional */
    }

    const { data: row, error } = await supabaseAdmin
      .from("beta_submissions")
      .insert({
        room_id: data.roomId,
        playlist_id: pl.id,
        submitter_user_id: context.userId,
        owner_id: room.owner_id,
        spotify_track_id: trackId,
        spotify_track_url: `https://open.spotify.com/track/${trackId}`,
        spotify_track_name: name,
        cost_points: SUBMIT_COST,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const after = await pointsFor(supabaseAdmin, data.roomId, context.userId);
    return { id: row.id as string, cost: SUBMIT_COST, remaining: after.available, name };
  });

export const listMyBetaSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string }) => ({ roomId: String(data?.roomId ?? "") }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertMember(supabaseAdmin, data.roomId, context.userId);
    const { data: rows } = await supabaseAdmin
      .from("beta_submissions")
      .select(
        "id, playlist_id, spotify_track_id, spotify_track_url, spotify_track_name, cost_points, status, curator_note, created_at, reviewed_at",
      )
      .eq("room_id", data.roomId)
      .eq("submitter_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return (rows ?? []) as any[];
  });

export const listBetaSubmissionsForOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string }) => ({ roomId: String(data?.roomId ?? "") }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOwner(supabaseAdmin, data.roomId, context.userId);

    // Hide submissions older than 15 days from the queue
    const cutoff = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows } = await supabaseAdmin
      .from("beta_submissions")
      .select(
        "id, playlist_id, submitter_user_id, spotify_track_id, spotify_track_url, spotify_track_name, cost_points, status, curator_note, created_at, reviewed_at",
      )
      .eq("room_id", data.roomId)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(200);

    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.submitter_user_id)));
    const { data: profiles } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, username").in("id", ids)
      : { data: [] as any[] };
    const nameById = new Map((profiles ?? []).map((p: any) => [p.id, p.username]));

    const { data: playlists } = await supabaseAdmin
      .from("beta_room_playlists")
      .select("id, name")
      .eq("room_id", data.roomId);
    const plById = new Map((playlists ?? []).map((p: any) => [p.id, p.name]));

    return (rows ?? []).map((r: any) => ({
      ...r,
      submitter_username: nameById.get(r.submitter_user_id) ?? null,
      playlist_name: plById.get(r.playlist_id) ?? null,
    }));
  });

export const reviewBetaSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { submissionId: string; approve: boolean; note?: string }) => ({
    submissionId: String(data?.submissionId ?? ""),
    approve: Boolean(data?.approve),
    note: String(data?.note ?? "").slice(0, 500),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("beta_submissions")
      .select("id, room_id, playlist_id, spotify_track_id, status")
      .eq("id", data.submissionId)
      .maybeSingle();
    if (!sub) throw new Error("Submission not found");
    await assertOwner(supabaseAdmin, sub.room_id as string, context.userId);
    if (sub.status !== "pending") throw new Error("That submission was already reviewed");

    let spotifyNote: string | null = null;
    if (data.approve) {
      try {
        const { getBetaAccessToken, betaAddTrackToPlaylist, betaPlaylistContainsTrack } =
          await import("./beta-spotify.server");
        const { data: pl } = await supabaseAdmin
          .from("beta_room_playlists")
          .select("spotify_playlist_id")
          .eq("id", sub.playlist_id)
          .maybeSingle();
        const token = await getBetaAccessToken(context.userId, supabaseAdmin);
        if (token && pl) {
          const already = await betaPlaylistContainsTrack(
            token,
            pl.spotify_playlist_id as string,
            sub.spotify_track_id as string,
          );
          if (!already) {
            const res = await betaAddTrackToPlaylist(
              token,
              pl.spotify_playlist_id as string,
              sub.spotify_track_id as string,
            );
            spotifyNote = res.ok
              ? "Added to your Spotify playlist."
              : "Approved, but Spotify rejected the add — add it manually.";
          } else {
            spotifyNote = "Already on the playlist.";
          }
        } else {
          spotifyNote = "Approved. Connect Spotify to add tracks automatically.";
        }
      } catch {
        spotifyNote = "Approved, but adding to Spotify failed — add it manually.";
      }
    }

    const { error } = await supabaseAdmin
      .from("beta_submissions")
      .update({
        status: data.approve ? "approved" : "rejected",
        curator_note: data.note || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
    if (error) throw new Error(error.message);

    if (data.approve) {
      // Track stays on the watch list so streams keep counting
      await supabaseAdmin.from("beta_room_tracks").upsert(
        {
          room_id: sub.room_id,
          playlist_id: sub.playlist_id,
          spotify_track_id: sub.spotify_track_id,
        },
        { onConflict: "room_id,spotify_track_id" },
      );
    }

    return { ok: true, spotifyNote };
  });
