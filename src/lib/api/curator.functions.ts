import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SpotifyPlaylistMeta = {
  name?: string;
  images?: Array<{ url?: string }>;
  owner?: { id?: string; display_name?: string | null };
  collaborative?: boolean;
};

type SpotifyPlaylistListItem = SpotifyPlaylistMeta & {
  id?: string;
  public?: boolean | null;
};

function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  const uriMatch = trimmed.match(/^spotify:playlist:([A-Za-z0-9]+)/);
  if (uriMatch) return uriMatch[1];
  const urlMatch = trimmed.match(/playlist\/([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9]{16,}$/.test(trimmed)) return trimmed;
  return null;
}

function hasPlaylistModifyScope(scope: string): boolean {
  return /\bplaylist-modify-(public|private)\b/.test(scope);
}

function hasPlaylistImportScopes(scope: string): boolean {
  return /\bplaylist-read-private\b/.test(scope) && /\bplaylist-read-collaborative\b/.test(scope);
}

async function getSpotifyCredsForUser(
  userId: string,
  supabaseAdmin: any,
): Promise<{ clientId: string; clientSecret: string }> {
  const { data } = await supabaseAdmin
    .from("spotify_user_apps")
    .select("client_id, client_secret")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.client_id && data?.client_secret) {
    return { clientId: data.client_id as string, clientSecret: data.client_secret as string };
  }
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Spotify not configured");
  return { clientId, clientSecret };
}

async function getCuratorSpotifyAccess(
  userId: string,
  supabaseAdmin: any,
): Promise<{ accessToken: string; spotifyUserId: string | null }> {
  const { data: conn } = await supabaseAdmin
    .from("spotify_connections")
    .select("access_token, refresh_token, expires_at, scope, spotify_user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conn) {
    throw new Error("Connect Spotify before adding curator playlists");
  }
  if (!hasPlaylistModifyScope(String(conn.scope ?? ""))) {
    throw new Error("Reconnect Spotify to allow playlist adding");
  }

  const expiresAt = new Date(conn.expires_at).getTime();
  if (Date.now() < expiresAt - 30_000) {
    return { accessToken: conn.access_token as string, spotifyUserId: conn.spotify_user_id ?? null };
  }

  const { clientId, clientSecret } = await getSpotifyCredsForUser(userId, supabaseAdmin);
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token as string,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Spotify playlist-owner refresh failed", {
      userId,
      status: res.status,
      body: body.slice(0, 300),
    });
    throw new Error("Spotify session expired. Disconnect and reconnect Spotify.");
  }
  const json: any = await res.json();
  const newAccess = json.access_token as string;
  const newRefresh = (json.refresh_token as string) || (conn.refresh_token as string);
  const newExpiresAt = new Date(Date.now() + (json.expires_in as number) * 1000).toISOString();
  await supabaseAdmin
    .from("spotify_connections")
    .update({
      access_token: newAccess,
      refresh_token: newRefresh,
      expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return { accessToken: newAccess, spotifyUserId: conn.spotify_user_id ?? null };
}

async function fetchPlaylistMeta(spotifyId: string, accessToken: string): Promise<SpotifyPlaylistMeta> {
  const metaRes = await fetch(
    `https://api.spotify.com/v1/playlists/${spotifyId}?fields=name,images,owner(id,display_name),collaborative`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (metaRes.status === 404) {
    throw new Error("Spotify playlist not found for your connected account");
  }
  if (!metaRes.ok) {
    const body = await metaRes.text().catch(() => "");
    console.error("Spotify playlist meta fetch failed", {
      spotifyId,
      status: metaRes.status,
      body: body.slice(0, 300),
    });
    throw new Error(`Spotify playlist check failed (${metaRes.status})`);
  }
  return (await metaRes.json()) as SpotifyPlaylistMeta;
}

async function fetchMySpotifyPlaylists(accessToken: string): Promise<SpotifyPlaylistListItem[]> {
  const playlists: SpotifyPlaylistListItem[] = [];
  let url: string | null =
    "https://api.spotify.com/v1/me/playlists?limit=50&fields=items(id,name,images,owner(id,display_name),collaborative,public),next";
  let pages = 0;

  while (url && pages < 20) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Spotify playlist import fetch failed", {
        status: res.status,
        body: body.slice(0, 300),
      });
      throw new Error(
        res.status === 401
          ? "Spotify session expired. Disconnect and reconnect Spotify."
          : res.status === 403
            ? "Reconnect Spotify so Orange Sound Guild can read your playlists."
            : `Spotify playlist import failed (${res.status})`,
      );
    }
    const json = (await res.json()) as { items?: SpotifyPlaylistListItem[]; next?: string | null };
    playlists.push(...(json.items ?? []));
    url = json.next ?? null;
    pages += 1;
  }

  return playlists;
}

export const addCuratorPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { url: string }) => data)
  .handler(async ({ data, context }) => {
    const spotifyId = extractPlaylistId(data.url);
    if (!spotifyId) throw new Error("Invalid Spotify playlist URL");

    // Verify user is superfan
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("account_type")
      .eq("id", context.userId)
      .maybeSingle();
    if (prof?.account_type !== "superfan") {
      throw new Error("Only Superfans can submit playlists");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { accessToken } = await getCuratorSpotifyAccess(context.userId, supabaseAdmin);
    const meta = await fetchPlaylistMeta(spotifyId, accessToken);
    // Allow any playlist the connected Spotify account can see (owned or collaborative).
    // Auto-adding tracks later will be gated by Spotify's own permission check.

    // Un-ignore if the user is re-adding a previously removed playlist
    await supabaseAdmin
      .from("curator_playlist_ignores")
      .delete()
      .eq("curator_id", context.userId)
      .eq("spotify_playlist_id", spotifyId);

    const name = meta.name || "Spotify playlist";
    const imageUrl = meta.images?.[0]?.url ?? null;
    const { data: inserted, error } = await supabaseAdmin
      .from("curator_playlists")
      .insert({
        curator_id: context.userId,
        spotify_playlist_id: spotifyId,
        name,
        image_url: imageUrl,
      })
      .select("id, spotify_playlist_id, name, image_url")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const importMySpotifyCuratorPlaylists = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("account_type")
      .eq("id", context.userId)
      .maybeSingle();
    if (prof?.account_type !== "superfan") {
      throw new Error("Only Superfans can sync curator playlists");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { accessToken, spotifyUserId } = await getCuratorSpotifyAccess(context.userId, supabaseAdmin);

    const { data: conn } = await supabaseAdmin
      .from("spotify_connections")
      .select("scope")
      .eq("user_id", context.userId)
      .maybeSingle();
    const needsReconnectForPrivate = !hasPlaylistImportScopes(String(conn?.scope ?? ""));

    const spotifyPlaylists = await fetchMySpotifyPlaylists(accessToken);

    // Skip playlists the user removed from the tracker
    const { data: ignoredRows } = await supabaseAdmin
      .from("curator_playlist_ignores")
      .select("spotify_playlist_id")
      .eq("curator_id", context.userId);
    const ignored = new Set(
      (ignoredRows ?? []).map((row: { spotify_playlist_id: string }) => row.spotify_playlist_id),
    );

    const curatorPlaylists = spotifyPlaylists.filter((playlist) => {
      if (!playlist.id) return false;
      if (ignored.has(playlist.id)) return false;
      if (playlist.collaborative) return true;
      return !!spotifyUserId && playlist.owner?.id === spotifyUserId;
    });

    const rows = curatorPlaylists.map((playlist) => ({
      curator_id: context.userId,
      spotify_playlist_id: playlist.id as string,
      name: playlist.name || "Spotify playlist",
      image_url: playlist.images?.[0]?.url ?? null,
    }));

    if (rows.length === 0) {
      return {
        imported: 0,
        updated: 0,
        skipped: spotifyPlaylists.length,
        needsReconnectForPrivate,
        playlists: [],
      };
    }

    const ids = rows.map((row) => row.spotify_playlist_id);
    const { data: existing } = await supabaseAdmin
      .from("curator_playlists")
      .select("spotify_playlist_id")
      .eq("curator_id", context.userId)
      .in("spotify_playlist_id", ids);
    const existingIds = new Set((existing ?? []).map((row: { spotify_playlist_id: string }) => row.spotify_playlist_id));

    const { data: saved, error } = await supabaseAdmin
      .from("curator_playlists")
      .upsert(rows, { onConflict: "curator_id,spotify_playlist_id" })
      .select("id, spotify_playlist_id, name, image_url");
    if (error) throw new Error(error.message);

    return {
      imported: rows.filter((row) => !existingIds.has(row.spotify_playlist_id)).length,
      updated: rows.filter((row) => existingIds.has(row.spotify_playlist_id)).length,
      skipped: Math.max(spotifyPlaylists.length - rows.length, 0),
      needsReconnectForPrivate,
      playlists: saved ?? [],
    };
  });

export const removeCuratorPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    // Look up the spotify id first so we can record an ignore, preventing re-sync.
    const { data: existing } = await context.supabase
      .from("curator_playlists")
      .select("spotify_playlist_id")
      .eq("id", data.id)
      .eq("curator_id", context.userId)
      .maybeSingle();

    await context.supabase
      .from("curator_playlists")
      .delete()
      .eq("id", data.id)
      .eq("curator_id", context.userId);

    if (existing?.spotify_playlist_id) {
      await context.supabase
        .from("curator_playlist_ignores")
        .upsert(
          { curator_id: context.userId, spotify_playlist_id: existing.spotify_playlist_id },
          { onConflict: "curator_id,spotify_playlist_id" },
        );
    }
    return { ok: true };
  });

export const listMyCuratorPlaylists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("curator_playlists")
      .select("id, spotify_playlist_id, name, image_url, created_at, is_osg, is_team, team_weekly_min, track_hold_days, daily_submission_limit, accept_pool_submissions")
      .eq("curator_id", context.userId)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const setCuratorPlaylistIsOsg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; isOsg: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_curator_playlist_is_osg", {
      _playlist_id: data.playlistId,
      _is_osg: data.isOsg,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setCuratorPlaylistHoldDays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; days: number }) => data)
  .handler(async ({ data, context }) => {
    const { data: days, error } = await context.supabase.rpc("curator_set_track_hold_days", {
      _playlist_id: data.playlistId,
      _days: Math.max(0, Math.min(365, Math.round(Number(data.days) || 0))),
    });
    if (error) throw new Error(error.message);
    return { days: (days as number | null) ?? 0 };
  });

export const setCuratorPlaylistDailyLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; limit: number }) => data)
  .handler(async ({ data, context }) => {
    const { data: limit, error } = await context.supabase.rpc(
      "curator_set_daily_submission_limit",
      {
        _playlist_id: data.playlistId,
        _limit: Math.max(1, Math.min(6, Math.round(Number(data.limit) || 1))),
      },
    );
    if (error) throw new Error(error.message);
    return { limit: (limit as number | null) ?? 1 };
  });

export const getCuratorEarnedPoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("get_curator_earned_points");
    return { points: (data as number | null) ?? 0 };
  });

export const curatorAdjustPlaylistPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; userId: string; delta: number; reason?: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
    userId: String(data?.userId ?? ""),
    delta: Math.trunc(Number(data?.delta) || 0),
    reason: String(data?.reason ?? "").slice(0, 200),
  }))
  .handler(async ({ data, context }) => {
    if (!data.playlistId) throw new Error("Pick a playlist");
    if (!data.delta) throw new Error("Enter a number of points");
    const { data: balance, error } = await context.supabase.rpc("curator_adjust_playlist_points", {
      _playlist_id: data.playlistId,
      _user_id: data.userId,
      _delta: data.delta,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { balance: (balance as number | null) ?? 0 };
  });
