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

export const startLastfmPlaylistTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: playlist } = await supabaseAdmin
      .from("beta_room_playlists")
      .select("id, room_id")
      .eq("id", data.playlistId)
      .maybeSingle();
    if (!playlist) throw new Error("Playlist not found");

    const [{ data: room }, { data: member }, { data: connection }, { count: trackCount }] =
      await Promise.all([
        supabaseAdmin.from("beta_rooms").select("owner_id").eq("id", playlist.room_id).maybeSingle(),
        supabaseAdmin
          .from("beta_room_members")
          .select("id")
          .eq("room_id", playlist.room_id)
          .eq("user_id", context.userId)
          .maybeSingle(),
        supabaseAdmin
          .from("lastfm_connections")
          .select("user_id")
          .eq("user_id", context.userId)
          .maybeSingle(),
        supabaseAdmin
          .from("beta_room_tracks")
          .select("id", { count: "exact", head: true })
          .eq("playlist_id", playlist.id),
      ]);
    if (!room || (!member && room.owner_id !== context.userId)) throw new Error("Join this room first");
    if (!connection) throw new Error("Connect your Last.fm account first");
    if (!trackCount) throw new Error("This playlist has no tracked tracks yet");

    const startedAt = new Date().toISOString();
    await supabaseAdmin
      .from("beta_playlist_tracking_sessions")
      .update({ stopped_at: startedAt, updated_at: startedAt })
      .eq("user_id", context.userId)
      .is("stopped_at", null);

    const { error } = await supabaseAdmin.from("beta_playlist_tracking_sessions").insert({
      playlist_id: playlist.id,
      user_id: context.userId,
      started_at: startedAt,
    });
    if (error) throw new Error(error.message);
    return { active: true, startedAt };
  });

export const stopLastfmPlaylistTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchLastfmRecentTracks, matchTrack, getLastfmApiKey, lastfmErrorMessage } =
      await import("./lastfm.server");

    const { data: session } = await supabaseAdmin
      .from("beta_playlist_tracking_sessions")
      .select("id, started_at")
      .eq("playlist_id", data.playlistId)
      .eq("user_id", context.userId)
      .is("stopped_at", null)
      .maybeSingle();
    if (!session) throw new Error("Tracking is not running for this playlist");

    const [{ data: playlist }, { data: connection }] = await Promise.all([
      supabaseAdmin
        .from("beta_room_playlists")
        .select("id, room_id")
        .eq("id", data.playlistId)
        .maybeSingle(),
      supabaseAdmin
        .from("lastfm_connections")
        .select("lastfm_username")
        .eq("user_id", context.userId)
        .maybeSingle(),
    ]);
    if (!playlist) throw new Error("Playlist not found");
    const watch = await loadRoomWatchTracks(supabaseAdmin, playlist.room_id, playlist.id);
    if (!connection) throw new Error("Connect your Last.fm account first");

    const { key: apiKey, error: keyError } = getLastfmApiKey();
    if (!apiKey) throw new Error(lastfmErrorMessage(keyError ?? "lastfm_key_missing"));

    const stoppedAt = new Date();
    const startedAtMs = new Date(session.started_at).getTime();
    let items: Awaited<ReturnType<typeof fetchLastfmRecentTracks>>["items"] = [];
    let fetchError: string | null = null;
    // Last.fm occasionally rate-limits or times out. Retry before giving up so a
    // single hiccup doesn't silently discard a whole listening session.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await fetchLastfmRecentTracks(
          connection.lastfm_username,
          apiKey,
          Math.floor(startedAtMs / 1000),
        );
        items = result.items;
        fetchError = result.error;
      } catch (e) {
        console.error("Last.fm stop-tracking fetch failed", e);
        items = [];
        fetchError = "lastfm_unavailable";
      }
      if (!fetchError) break;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }

    // If Last.fm could not be read, keep the session open so the user can press
    // Stop again instead of losing every play they made.
    if (fetchError) {
      throw new Error(
        `${lastfmErrorMessage(fetchError)} Your session is still running — press Stop again in a moment.`,
      );
    }


    const eligibleItems = (Array.isArray(items) ? items : []).filter(
      (item) => item.uts * 1000 >= startedAtMs && item.uts * 1000 <= stoppedAt.getTime(),
    );
    let added = 0;
    let matched = 0;
    const rows: any[] = [];
    for (const item of eligibleItems) {
      const matchedTrack = (watch ?? []).find((track: any) =>
        matchTrack(
          item.name,
          item.artist,
          (track.track_name ?? "") as string,
          (track.artist_name ?? "") as string,
        ),
      );
      if (!matchedTrack) continue;
      matched++;
      rows.push({
        room_id: playlist.room_id,
        user_id: context.userId,
        playlist_id: playlist.id,
        spotify_track_id: matchedTrack.spotify_track_id,
        spotify_track_name: item.name,
        played_at: item.playedAt,
        source: "lastfm_session",
      });
    }
    // Insert in chunks so a long session (hundreds of scrobbles) doesn't time out.
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      // Skip plays already recorded (e.g. from an earlier Stop attempt) instead of
      // failing the whole chunk.
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("beta_stream_points")
        .upsert(chunk, {
          onConflict: "room_id,user_id,spotify_track_id,played_at",
          ignoreDuplicates: true,
        })
        .select("id");
      if (insertError) {
        console.error("Last.fm stream point insert failed", insertError);
        throw new Error("Could not save your plays. Your session is still running — press Stop again.");
      }
      added += inserted?.length ?? 0;
    }


    const stoppedAtIso = stoppedAt.toISOString();
    const { error: stopError } = await supabaseAdmin
      .from("beta_playlist_tracking_sessions")
      .update({ stopped_at: stoppedAtIso, updated_at: stoppedAtIso })
      .eq("id", session.id)
      .is("stopped_at", null);
    if (stopError) throw new Error(stopError.message);

    return {
      active: false,
      added,
      matched,
      scanned: eligibleItems.length,
      warning: fetchError ? lastfmErrorMessage(fetchError) : null,
    };
  });

/**
 * Re-checks Last.fm for a finished session window and adds any plays that
 * Last.fm had not yet processed when Stop was pressed. Duplicates are skipped.
 * Members can rescan their own sessions; the room owner can rescan anyone's.
 */
export const rescanLastfmSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sessionId: string }) => ({
    sessionId: String(data?.sessionId ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchLastfmRecentTracks, matchTrack, getLastfmApiKey, lastfmErrorMessage } =
      await import("./lastfm.server");

    const { data: session } = await supabaseAdmin
      .from("beta_playlist_tracking_sessions")
      .select("id, playlist_id, user_id, started_at, stopped_at")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!session) throw new Error("Session not found");

    const { data: playlist } = await supabaseAdmin
      .from("beta_room_playlists")
      .select("id, room_id")
      .eq("id", session.playlist_id)
      .maybeSingle();
    if (!playlist) throw new Error("Playlist not found");
    if (session.user_id !== context.userId) {
      const { data: room } = await supabaseAdmin
        .from("beta_rooms")
        .select("owner_id")
        .eq("id", playlist.room_id)
        .maybeSingle();
      if (!room || room.owner_id !== context.userId) throw new Error("Not allowed");
    }

    const { data: connection } = await supabaseAdmin
      .from("lastfm_connections")
      .select("lastfm_username")
      .eq("user_id", session.user_id)
      .maybeSingle();
    const watch = await loadRoomWatchTracks(supabaseAdmin, playlist.room_id, playlist.id);
    if (!connection) throw new Error("This member has no Last.fm account connected");

    const { key: apiKey, error: keyError } = getLastfmApiKey();
    if (!apiKey) throw new Error(lastfmErrorMessage(keyError ?? "lastfm_key_missing"));

    const startMs = new Date(session.started_at).getTime();
    const stopMs = session.stopped_at ? new Date(session.stopped_at).getTime() : Date.now();
    const result = await fetchLastfmRecentTracks(
      connection.lastfm_username,
      apiKey,
      Math.floor(startMs / 1000),
    );
    if (result.error) throw new Error(lastfmErrorMessage(result.error));

    const rows: any[] = [];
    for (const item of result.items ?? []) {
      const t = item.uts * 1000;
      if (t < startMs || t > stopMs) continue;
      const m = (watch ?? []).find((track: any) =>
        matchTrack(item.name, item.artist, track.track_name ?? "", track.artist_name ?? ""),
      );
      if (!m) continue;
      rows.push({
        room_id: playlist.room_id,
        user_id: session.user_id,
        playlist_id: playlist.id,
        spotify_track_id: m.spotify_track_id,
        spotify_track_name: item.name,
        played_at: item.playedAt,
        source: "lastfm_rescan",
      });
    }
    let added = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const { data: inserted, error } = await supabaseAdmin
        .from("beta_stream_points")
        .upsert(rows.slice(i, i + 200), {
          onConflict: "room_id,user_id,spotify_track_id,played_at",
          ignoreDuplicates: true,
        })
        .select("id");
      if (error) throw new Error("Could not save the plays. Please try again.");
      added += inserted?.length ?? 0;
    }
    return { added, matched: rows.length };
  });

/**
 * Every track in the room (all playlists), with the tracked playlist's own
 * tracks first. OSG plays from any room playlist count toward the session.
 */
async function loadRoomWatchTracks(admin: any, roomId: string, playlistId: string) {
  const all: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("beta_room_tracks")
      .select("spotify_track_id, track_name, artist_name, playlist_id")
      .eq("room_id", roomId)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return [
    ...all.filter((t) => t.playlist_id === playlistId),
    ...all.filter((t) => t.playlist_id !== playlistId),
  ];
}
