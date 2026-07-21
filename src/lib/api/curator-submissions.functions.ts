import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function extractTrackId(input: string): string | null {
  const trimmed = input.trim();
  const uri = trimmed.match(/^spotify:track:([A-Za-z0-9]+)$/);
  if (uri) return uri[1];
  const url = trimmed.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)/i);
  if (url) return url[1];
  if (/^[A-Za-z0-9]{16,}$/.test(trimmed)) return trimmed;
  return null;
}

async function getAppToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Spotify app token failed [${res.status}]`);
  const j = await res.json();
  return j.access_token as string;
}

async function fetchPlaylistArtistIds(playlistSpotifyId: string, appToken: string): Promise<string[]> {
  const ids = new Set<string>();
  let url:
    | string
    | null = `https://api.spotify.com/v1/playlists/${playlistSpotifyId}/tracks?fields=items(track(artists(id))),next&limit=100`;
  while (url) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${appToken}` } });
    if (!res.ok) break;
    const body: any = await res.json();
    for (const it of body.items ?? []) {
      const artists = it?.track?.artists ?? [];
      for (const a of artists) if (a?.id) ids.add(a.id);
    }
    url = body.next ?? null;
  }
  return Array.from(ids);
}

async function fetchTrackMeta(trackId: string, appToken: string) {
  const res = await fetch(
    `https://api.spotify.com/v1/tracks/${trackId}?fields=id,name,artists(id)`,
    { headers: { Authorization: `Bearer ${appToken}` } },
  );
  if (!res.ok) return null;
  return (await res.json()) as { id: string; name: string; artists: Array<{ id: string }> };
}

async function userFollowsAll(userAccessToken: string, artistIds: string[]): Promise<boolean> {
  if (artistIds.length === 0) return false;
  // Endpoint allows up to 50 ids per call
  for (let i = 0; i < artistIds.length; i += 50) {
    const chunk = artistIds.slice(i, i + 50);
    const url = `https://api.spotify.com/v1/me/following/contains?type=artist&ids=${chunk.join(",")}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${userAccessToken}` } });
    if (!res.ok) return false;
    const arr = (await res.json()) as boolean[];
    if (arr.some((v) => !v)) return false;
  }
  return true;
}

export const listPlaylistsForSubmission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_playlists_for_submission");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      curator_id: string;
      curator_username: string;
      spotify_playlist_id: string;
      name: string;
      image_url: string | null;
      available_points: number;
    }>;
  });

export const listMyTrackSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_my_track_submissions");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listCuratorSubmissionsForMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_curator_submissions_for_me");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

async function getCuratorSpotifyCreds(userId: string, supabaseAdmin: any) {
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

type SpotifyTokenResult =
  | { accessToken: string; error?: never }
  | { accessToken?: never; error: string };

type SpotifyAutoAddResult = {
  attempted: boolean;
  added: boolean;
  alreadyOnPlaylist?: boolean;
  error?: string;
};

function hasPlaylistModifyScope(scope: string): boolean {
  return /\bplaylist-modify-(public|private)\b/.test(scope);
}

async function getCuratorAccessToken(
  userId: string,
  supabaseAdmin: any,
): Promise<SpotifyTokenResult> {
  const { data: conn } = await supabaseAdmin
    .from("spotify_connections")
    .select("access_token, refresh_token, expires_at, scope")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conn) return { error: "spotify_not_connected" };
  const scope = String(conn.scope ?? "");
  if (!hasPlaylistModifyScope(scope)) {
    // Old connection without required scope
    return { error: "spotify_missing_playlist_scope" };
  }
  const expiresAt = new Date(conn.expires_at).getTime();
  if (Date.now() < expiresAt - 30_000) return { accessToken: conn.access_token as string };

  const { clientId, clientSecret } = await getCuratorSpotifyCreds(userId, supabaseAdmin);
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Spotify auto-add refresh failed", {
      userId,
      status: res.status,
      body: body.slice(0, 300),
    });
    return { error: "spotify_refresh_failed_reconnect" };
  }
  const json: any = await res.json();
  const newAccess = json.access_token as string;
  const newRefresh = (json.refresh_token as string) || conn.refresh_token;
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
  return { accessToken: newAccess };
}

async function playlistContainsTrack(
  playlistId: string,
  trackId: string,
  accessToken: string,
): Promise<{ contains: boolean; error?: string }> {
  const targetUri = `spotify:track:${trackId}`;
  let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?fields=items(track(uri)),next&limit=100`;
  while (url) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Spotify playlist contains check failed", {
        playlistId,
        trackId,
        status: res.status,
        body: body.slice(0, 300),
      });
      return { contains: false, error: `spotify_contains_${res.status}` };
    }
    const body: any = await res.json();
    for (const it of body.items ?? []) {
      if (it?.track?.uri === targetUri) return { contains: true };
    }
    url = body.next ?? null;
  }
  return { contains: false };
}

async function addTrackToPlaylist(
  playlistId: string,
  trackId: string,
  accessToken: string,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
  });
  if (res.ok) return { ok: true, status: res.status };
  const t = await res.text().catch(() => "");
  return { ok: false, status: res.status, error: t };
}

async function addSubmissionTrackToSpotify(
  submissionId: string,
  curatorId: string,
  supabaseAdmin: any,
): Promise<SpotifyAutoAddResult> {
  const autoAdd: SpotifyAutoAddResult = { attempted: true, added: false };

  const { data: sub, error: subError } = await supabaseAdmin
    .from("curator_submissions")
    .select("spotify_track_id, curator_playlist_id, curator_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (subError) {
    console.error("Curator submission lookup failed", { submissionId, error: subError.message });
    return { ...autoAdd, error: "submission_lookup_failed" };
  }
  if (!sub || sub.curator_id !== curatorId) {
    return { ...autoAdd, error: "submission_not_found" };
  }

  const { data: pl, error: playlistError } = await supabaseAdmin
    .from("curator_playlists")
    .select("spotify_playlist_id")
    .eq("id", sub.curator_playlist_id)
    .maybeSingle();
  if (playlistError) {
    console.error("Curator playlist lookup failed", {
      submissionId,
      playlistId: sub.curator_playlist_id,
      error: playlistError.message,
    });
    return { ...autoAdd, error: "playlist_lookup_failed" };
  }
  if (!pl?.spotify_playlist_id) {
    return { ...autoAdd, error: "playlist_not_found" };
  }

  const token = await getCuratorAccessToken(curatorId, supabaseAdmin);
  if (token.error) {
    return { ...autoAdd, error: token.error };
  }

  const already = await playlistContainsTrack(
    pl.spotify_playlist_id,
    sub.spotify_track_id,
    token.accessToken,
  );
  if (already.contains) {
    return { ...autoAdd, alreadyOnPlaylist: true };
  }

  const added = await addTrackToPlaylist(
    pl.spotify_playlist_id,
    sub.spotify_track_id,
    token.accessToken,
  );
  if (added.ok) {
    return { ...autoAdd, added: true };
  }

  console.error("Spotify auto-add failed", {
    submissionId,
    playlistId: pl.spotify_playlist_id,
    trackId: sub.spotify_track_id,
    status: added.status,
    body: added.error?.slice(0, 300),
    containsError: already.error,
  });
  return {
    ...autoAdd,
    error:
      added.status === 401
        ? "spotify_unauthorized_reconnect"
        : added.status === 403
          ? "spotify_forbidden_check_ownership_or_scope"
          : added.status === 404
            ? "spotify_playlist_or_track_not_found"
            : added.status === 429
              ? "spotify_rate_limited"
              : `spotify_${added.status}`,
  };
}

export const reviewCuratorSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; approve: boolean; note?: string }) => d)
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc("review_curator_submission", {
      _submission_id: data.id,
      _approve: data.approve,
      _note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);

    // On approve, try to auto-add track to the curator's Spotify playlist
    let autoAdd: SpotifyAutoAddResult = { attempted: false, added: false };

    if (data.approve) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        autoAdd = await addSubmissionTrackToSpotify(data.id, context.userId, supabaseAdmin);
      } catch (e: any) {
        autoAdd.error = e?.message ?? "auto_add_failed";
      }
    }

    return { ok: true, autoAdd };
  });

export const addCuratorSubmissionToSpotify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("Submission is required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const autoAdd = await addSubmissionTrackToSpotify(data.id, context.userId, supabaseAdmin);
    return { ok: !autoAdd.error || autoAdd.added || autoAdd.alreadyOnPlaylist, autoAdd };
  });

export const submitCuratorTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { playlistId: string; trackUrl: string }) => {
    const trackUrl = String(d?.trackUrl ?? "").trim();
    if (!trackUrl) throw new Error("Track URL is required");
    return { playlistId: String(d?.playlistId ?? ""), trackUrl };
  })
  .handler(async ({ context, data }) => {
    const trackId = extractTrackId(data.trackUrl);
    if (!trackId) throw new Error("Invalid Spotify track URL");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load playlist
    const { data: pl } = await supabaseAdmin
      .from("curator_playlists")
      .select("id, spotify_playlist_id, curator_id")
      .eq("id", data.playlistId)
      .maybeSingle();
    if (!pl) throw new Error("Playlist not found");

    // Get user's Spotify access token (for follow check)
    const { data: conn } = await supabaseAdmin
      .from("spotify_connections")
      .select("access_token, refresh_token, expires_at, scope")
      .eq("user_id", context.userId)
      .maybeSingle();

    // App-level token for public metadata
    const appToken = await getAppToken();
    const trackMeta = await fetchTrackMeta(trackId, appToken);
    if (!trackMeta) throw new Error("Track not found on Spotify");

    // Follow check — requires user token with user-follow-read
    let followedAll = false;
    if (conn && (conn.scope ?? "").includes("user-follow-read")) {
      try {
        const artistIds = await fetchPlaylistArtistIds(pl.spotify_playlist_id, appToken);
        if (artistIds.length > 0) {
          followedAll = await userFollowsAll(conn.access_token, artistIds);
        }
      } catch (e) {
        console.error("Follow check failed", e);
      }
    }

    const trackUrl = `https://open.spotify.com/track/${trackId}`;
    const { data: submissionId, error } = await context.supabase.rpc("submit_curator_track", {
      _playlist_id: data.playlistId,
      _spotify_track_id: trackId,
      _spotify_track_url: trackUrl,
      _spotify_track_name: trackMeta.name ?? undefined,
      _followed_all: followedAll,
    });
    if (error) throw new Error(error.message);

    const cost = followedAll ? 45 : 50;

    // Fetch playlist name for the receipt
    const { data: plMeta } = await supabaseAdmin
      .from("curator_playlists")
      .select("name")
      .eq("id", data.playlistId)
      .maybeSingle();

    // Updated available balance for this playlist
    const { data: newBalance } = await context.supabase.rpc("get_playlist_available_points", {
      _playlist_id: data.playlistId,
    });

    return {
      id: submissionId as string,
      cost,
      followedAll,
      playlistName: plMeta?.name ?? "playlist",
      trackName: trackMeta.name ?? null,
      newBalance: (newBalance as number | null) ?? 0,
    };
  });
