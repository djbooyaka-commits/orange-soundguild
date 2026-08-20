import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Last.fm tracking — bypasses Spotify's development-mode user cap entirely.
 * Users connect their Last.fm account (just a username — no OAuth needed),
 * enable Spotify→Last.fm scrobbling on their Last.fm settings page, and the
 * site reads their recent plays via the public Last.fm API.
 */

export const setLastfmUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { username: string }) => {
    const username = String(data?.username ?? "").trim();
    if (!username) throw new Error("Last.fm username is required");
    if (username.length > 50) throw new Error("Username is too long");
    return { username };
  })
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getLastfmApiKey, lastfmErrorMessage } = await import("./lastfm.server");

    const { key: apiKey, error: keyError } = getLastfmApiKey();
    if (!apiKey) throw new Error(lastfmErrorMessage(keyError!));

    // Verify the username exists on Last.fm before saving
    const checkUrl = new URL("https://ws.audioscrobbler.com/2.0/");
    checkUrl.searchParams.set("method", "user.getinfo");
    checkUrl.searchParams.set("user", data.username);
    checkUrl.searchParams.set("api_key", apiKey);
    checkUrl.searchParams.set("format", "json");

    let res: Response;
    try {
      res = await fetch(checkUrl.toString());
    } catch {
      throw new Error(lastfmErrorMessage("lastfm_unavailable"));
    }

    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (body?.error) {
      const code = Number(body.error);
      if (code === 6) throw new Error(lastfmErrorMessage("lastfm_user_not_found"));
      if (code === 10 || code === 26) throw new Error(lastfmErrorMessage("lastfm_key_rejected"));
      if (code === 29) throw new Error(lastfmErrorMessage("lastfm_rate_limited"));
      throw new Error(lastfmErrorMessage(`lastfm_${code}`));
    }
    if (!res.ok) {
      if (res.status === 403) throw new Error(lastfmErrorMessage("lastfm_key_rejected"));
      if (res.status === 404) throw new Error(lastfmErrorMessage("lastfm_user_not_found"));
      if (res.status === 429) throw new Error(lastfmErrorMessage("lastfm_rate_limited"));
      throw new Error(lastfmErrorMessage("lastfm_unavailable"));
    }

    const { error } = await supabaseAdmin
      .from("lastfm_connections")
      .upsert(
        {
          user_id: context.userId,
          lastfm_username: data.username,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, username: data.username };
  });

export const getLastfmStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("lastfm_connections")
      .select("lastfm_username, last_polled_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      connected: !!data,
      username: data?.lastfm_username ?? null,
      lastPolledAt: data?.last_polled_at ?? null,
    };
  });

export const disconnectLastfm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("lastfm_connections").delete().eq("user_id", context.userId);
    return { ok: true };
  });

/**
 * Sync the caller's Last.fm scrobbles into this beta room.
 * Matches scrobbles against the room's watch list by track name + artist name.
 * No Spotify API call, no user cap.
 */
export const syncLastfmBetaRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { roomId: string }) => ({ roomId: String(data?.roomId ?? "") }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchLastfmRecentTracks, matchTrack, getLastfmApiKey, lastfmErrorMessage } =
      await import("./lastfm.server");

    const { key: apiKey, error: keyError } = getLastfmApiKey();
    if (!apiKey) {
      return {
        added: 0,
        connected: true,
        error: keyError,
        errorMessage: lastfmErrorMessage(keyError!),
        scanned: 0,
        matched: 0,
        watching: 0,
      };
    }

    // Get user's Last.fm connection
    const { data: conn } = await supabaseAdmin
      .from("lastfm_connections")
      .select("lastfm_username, last_polled_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!conn)
      return { added: 0, connected: false, error: null as string | null, errorMessage: null as string | null };

    // Check room membership
    const { data: room } = await supabaseAdmin
      .from("beta_rooms")
      .select("id, owner_id")
      .eq("id", data.roomId)
      .maybeSingle();
    if (!room) throw new Error("Room not found");

    const { data: member } = await supabaseAdmin
      .from("beta_room_members")
      .select("id")
      .eq("room_id", data.roomId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member && room.owner_id !== context.userId) throw new Error("Join this room first");

    // Get watch list — one entry per track, bound to a single playlist so a
    // track that sits on several playlists only funds one of them.
    const { data: watch } = await supabaseAdmin
      .from("beta_room_tracks")
      .select("spotify_track_id, track_name, artist_name, playlist_id, created_at")
      .eq("room_id", data.roomId)
      .order("created_at", { ascending: true });

    // Team playlists win when the same track sits on several playlists, so a
    // team room's points never leak to a regular playlist that shares the track.
    const { data: pls } = await supabaseAdmin
      .from("beta_room_playlists")
      .select("id, is_team")
      .eq("room_id", data.roomId);
    const teamPlaylists = new Set(
      (pls ?? []).filter((p: any) => p.is_team).map((p: any) => String(p.id)),
    );

    const bestByTrack = new Map<string, any>();
    for (const t of watch ?? []) {
      const key = String(t.spotify_track_id);
      const prev = bestByTrack.get(key);
      const isTeam = t.playlist_id ? teamPlaylists.has(String(t.playlist_id)) : false;
      if (!prev) {
        bestByTrack.set(key, { ...t, isTeam });
        continue;
      }
      if (isTeam && !prev.isTeam) bestByTrack.set(key, { ...t, isTeam });
    }
    const watchList = [...bestByTrack.values()].map((t: any) => ({
      spotifyTrackId: t.spotify_track_id as string,
      name: (t.track_name ?? "") as string,
      artist: (t.artist_name ?? "") as string,
      playlistId: (t.playlist_id ?? null) as string | null,
    }));

    if (watchList.length === 0) {
      return {
        added: 0,
        connected: true,
        error: null as string | null,
        errorMessage: null as string | null,
        scanned: 0,
        matched: 0,
        watching: 0,
      };
    }

    // Fetch recent scrobbles from Last.fm
    // Re-read a full day so a temporarily unmatched first play can be recovered
    // after playlist metadata or matching rules are corrected. The database's
    // duplicate guard keeps already-counted scrobbles from earning points twice.
    const OVERLAP_MS = 24 * 60 * 60 * 1000;
    const fromMs = conn.last_polled_at
      ? new Date(conn.last_polled_at).getTime() - OVERLAP_MS
      : Date.now() - 24 * 60 * 60 * 1000;
    const fromTimestamp = Math.floor(fromMs / 1000);

    const { items, error } = await fetchLastfmRecentTracks(conn.lastfm_username, apiKey, fromTimestamp);
    if (error) {
      return {
        added: 0,
        connected: true,
        error,
        errorMessage: lastfmErrorMessage(error),
        scanned: 0,
        matched: 0,
        watching: watchList.length,
      };
    }

    // Match and insert
    let added = 0;
    let matched = 0;
    let maxUts = 0;

    for (const item of items) {
      maxUts = Math.max(maxUts, item.uts);

      for (const w of watchList) {
        if (matchTrack(item.name, item.artist, w.name, w.artist)) {
          matched++;
          const { error: insErr } = await supabaseAdmin.from("beta_stream_points").insert({
            room_id: data.roomId,
            user_id: context.userId,
            spotify_track_id: w.spotifyTrackId,
            playlist_id: w.playlistId,
            spotify_track_name: item.name,
            played_at: item.playedAt,
            source: "lastfm",
          });
          if (!insErr) added++;
          break; // one match per scrobble
        }
      }
    }

    // Advance the global Last.fm polling cursor
    if (maxUts > 0) {
      await supabaseAdmin
        .from("lastfm_connections")
        .update({ last_polled_at: new Date(maxUts * 1000).toISOString() })
        .eq("user_id", context.userId);
    }

    return {
      added,
      connected: true,
      error: null as string | null,
      errorMessage: null as string | null,
      scanned: items.length,
      matched,
      watching: watchList.length,
    };
  });

/**
 * Per-playlist Last.fm sync. Only matches the tracks that belong to THIS
 * playlist, and credits the points to it. Because each room's points table
 * has a (room, user, track, played_at) uniqueness guard, a shared track can
 * only be counted once per room — the playlist you sync from claims it.
 */
export const syncLastfmPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchLastfmRecentTracks, matchTrack, getLastfmApiKey, lastfmErrorMessage } =
      await import("./lastfm.server");

    const empty = {
      added: 0,
      connected: true,
      error: null as string | null,
      errorMessage: null as string | null,
      scanned: 0,
      matched: 0,
      watching: 0,
    };

    const { key: apiKey, error: keyError } = getLastfmApiKey();
    if (!apiKey)
      return { ...empty, error: keyError, errorMessage: lastfmErrorMessage(keyError!) };

    const { data: pl } = await supabaseAdmin
      .from("beta_room_playlists")
      .select("id, room_id, name")
      .eq("id", data.playlistId)
      .maybeSingle();
    if (!pl) throw new Error("Playlist not found");

    const { data: room } = await supabaseAdmin
      .from("beta_rooms")
      .select("id, owner_id")
      .eq("id", pl.room_id)
      .maybeSingle();
    if (!room) throw new Error("Room not found");

    const { data: member } = await supabaseAdmin
      .from("beta_room_members")
      .select("id")
      .eq("room_id", pl.room_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!member && room.owner_id !== context.userId) throw new Error("Join this room first");

    const { data: conn } = await supabaseAdmin
      .from("lastfm_connections")
      .select("lastfm_username")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!conn) return { ...empty, connected: false };

    const { data: watch } = await supabaseAdmin
      .from("beta_room_tracks")
      .select("spotify_track_id, track_name, artist_name")
      .eq("room_id", pl.room_id)
      .eq("playlist_id", pl.id);

    const watchList = (watch ?? []).map((t: any) => ({
      spotifyTrackId: String(t.spotify_track_id),
      name: (t.track_name ?? "") as string,
      artist: (t.artist_name ?? "") as string,
    }));
    if (watchList.length === 0) return empty;

    // Fixed 24h lookback — the per-room uniqueness guard prevents double counting,
    // and a shared global cursor would starve the other playlists in this room.
    const fromTimestamp = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const { items, error } = await fetchLastfmRecentTracks(
      conn.lastfm_username,
      apiKey,
      fromTimestamp,
    );
    if (error)
      return {
        ...empty,
        error,
        errorMessage: lastfmErrorMessage(error),
        watching: watchList.length,
      };

    let added = 0;
    let matched = 0;
    for (const item of items) {
      for (const w of watchList) {
        if (matchTrack(item.name, item.artist, w.name, w.artist)) {
          matched++;
          const { error: insErr } = await supabaseAdmin.from("beta_stream_points").insert({
            room_id: pl.room_id,
            user_id: context.userId,
            playlist_id: pl.id,
            spotify_track_id: w.spotifyTrackId,
            spotify_track_name: item.name,
            played_at: item.playedAt,
            source: "lastfm",
          });
          if (!insErr) added++;
          break;
        }
      }
    }

    return {
      added,
      connected: true,
      error: null as string | null,
      errorMessage: null as string | null,
      scanned: items.length,
      matched,
      watching: watchList.length,
    };
  });
