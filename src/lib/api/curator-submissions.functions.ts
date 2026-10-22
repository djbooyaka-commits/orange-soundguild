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

async function fetchPlaylistArtistIds(playlistSpotifyId: string, token: string): Promise<string[]> {
  const ids = new Set<string>();
  // Use the current Playlist Items endpoint. Spotify now marks the old
  // /tracks endpoint as deprecated and can reject it even for valid tokens.
  let url:
    | string
    | null = `https://api.spotify.com/v1/playlists/${playlistSpotifyId}/items?limit=100&additional_types=track`;
  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("fetchPlaylistArtistIds failed", {
        status: res.status,
        playlistSpotifyId,
        body: body.slice(0, 500),
      });
      throw new Error(`spotify_playlist_fetch_failed_${res.status}`);
    }
    const body: any = await res.json();
    for (const it of body.items ?? []) {
      if (it?.track?.type && it.track.type !== "track") continue;
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

async function fetchSubmittedTrackArtistIds(
  curatorPlaylistId: string,
  supabaseAdmin: any,
  appToken: string,
): Promise<string[]> {
  const ids = new Set<string>();
  const { data, error } = await supabaseAdmin
    .from("curator_submissions")
    .select("spotify_track_id")
    .eq("curator_playlist_id", curatorPlaylistId);

  if (error) {
    console.error("Submitted track fallback lookup failed", {
      curatorPlaylistId,
      error: error.message,
    });
    return [];
  }

  const trackIds = Array.from(
    new Set(
      (data ?? [])
        .map((row: { spotify_track_id?: string | null }) => row.spotify_track_id)
        .filter((trackId: string | null | undefined): trackId is string => !!trackId),
    ),
  );

  for (let i = 0; i < trackIds.length; i += 50) {
    const chunk = trackIds.slice(i, i + 50);
    const res = await fetch(`https://api.spotify.com/v1/tracks?ids=${chunk.join(",")}`, {
      headers: { Authorization: `Bearer ${appToken}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Submitted track fallback metadata failed", {
        status: res.status,
        body: body.slice(0, 300),
      });
      continue;
    }
    const body: any = await res.json();
    for (const track of body.tracks ?? []) {
      for (const artist of track?.artists ?? []) {
        if (artist?.id) ids.add(artist.id);
      }
    }
  }

  return Array.from(ids);
}

async function fetchOsgFollowListArtistIds(curatorId: string, supabaseAdmin: any): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("osg_artist_follow_links")
    .select("spotify_artist_id")
    .eq("curator_id", curatorId);
  if (error) {
    console.error("OSG follow-list lookup failed", { curatorId, error: error.message });
    return [];
  }
  return Array.from(
    new Set(
      (data ?? [])
        .map((row: { spotify_artist_id?: string | null }) => row.spotify_artist_id)
        .filter((id: string | null | undefined): id is string => !!id),
    ),
  );
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
    const rows = (data ?? []) as any[];
    const approvedIds = rows.filter((r) => r.status === "approved").map((r) => r.id);
    if (!approvedIds.length) return rows;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const waitingIds = new Set<string>();
    for (let i = 0; i < approvedIds.length; i += 200) {
      const { data: flags } = await supabaseAdmin
        .from("curator_submissions")
        .select("id, added_to_spotify")
        .in("id", approvedIds.slice(i, i + 200));
      for (const f of flags ?? []) if (!f.added_to_spotify) waitingIds.add(f.id as string);
    }
    // Approved tracks not yet on Spotify still look "pending" to the submitter
    return rows.map((r) =>
      waitingIds.has(r.id)
        ? { ...r, status: "pending", reviewed_at: null, curator_note: null }
        : r,
    );
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
  | { accessToken: string; spotifyUserId: string | null; error?: never }
  | { accessToken?: never; error: string };

type SpotifyAutoAddResult = {
  attempted: boolean;
  added: boolean;
  alreadyOnPlaylist?: boolean;
  error?: string;
  playlistOwnerId?: string | null;
  playlistOwnerName?: string | null;
  playlistCollaborative?: boolean | null;
  connectedSpotifyUserId?: string | null;
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
    .select("access_token, refresh_token, expires_at, scope, spotify_user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conn) return { error: "spotify_not_connected" };
  const scope = String(conn.scope ?? "");
  if (!hasPlaylistModifyScope(scope)) {
    // Old connection without required scope
    return { error: "spotify_missing_playlist_scope" };
  }
  const expiresAt = new Date(conn.expires_at).getTime();
  if (Date.now() < expiresAt - 30_000) {
    return { accessToken: conn.access_token as string, spotifyUserId: conn.spotify_user_id ?? null };
  }

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
  return { accessToken: newAccess, spotifyUserId: conn.spotify_user_id ?? null };
}

async function fetchPlaylistWriteContext(
  playlistId: string,
  accessToken: string,
): Promise<{
  ownerId: string | null;
  ownerName: string | null;
  collaborative: boolean | null;
  public: boolean | null;
  error?: string;
}> {
  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=owner(id,display_name),name,collaborative,public`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (res.ok) {
    const body: any = await res.json();
    return {
      ownerId: body?.owner?.id ?? null,
      ownerName: body?.owner?.display_name ?? null,
      collaborative: typeof body?.collaborative === "boolean" ? body.collaborative : null,
      public: typeof body?.public === "boolean" ? body.public : null,
    };
  }
  const body = await res.text().catch(() => "");
  console.error("Spotify playlist write-context check failed", {
    playlistId,
    status: res.status,
    body: body.slice(0, 300),
  });
  return {
    ownerId: null,
    ownerName: null,
    collaborative: null,
    public: null,
    error:
      res.status === 401
        ? "spotify_unauthorized_reconnect"
        : res.status === 403
          ? "spotify_playlist_not_accessible"
          : res.status === 404
            ? "spotify_playlist_not_found"
            : `spotify_playlist_check_${res.status}`,
  };
}

async function playlistContainsTrack(
  playlistId: string,
  trackId: string,
  accessToken: string,
): Promise<{ contains: boolean; error?: string }> {
  const targetUri = `spotify:track:${trackId}`;
  let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100&additional_types=track`;
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
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
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
  if ("error" in token) {
    return { ...autoAdd, error: token.error };
  }
  const accessToken = token.accessToken;

  // Skip the local owner pre-check — Spotify allows collaborators (not just
  // the owner) to add tracks. Just try the add; if the user actually lacks
  // permission, Spotify returns 403 and we surface a precise error below.
  const already = await playlistContainsTrack(
    pl.spotify_playlist_id,
    sub.spotify_track_id,
    accessToken,
  );
  if (already.contains) {
    return { ...autoAdd, alreadyOnPlaylist: true };
  }

  const added = await addTrackToPlaylist(
    pl.spotify_playlist_id,
    sub.spotify_track_id,
    accessToken,
  );
  if (added.ok) {
    return { ...autoAdd, added: true };
  }

  // If it failed, fetch the owner to give a precise reason.
  let writeContext: Awaited<ReturnType<typeof fetchPlaylistWriteContext>> | null = null;
  let permissionError = "spotify_forbidden_not_owner_or_collaborator";
  if (added.status === 403) {
    writeContext = await fetchPlaylistWriteContext(pl.spotify_playlist_id, accessToken);
    if (writeContext.error) {
      permissionError = writeContext.error;
    } else if (writeContext.ownerId && token.spotifyUserId && writeContext.ownerId !== token.spotifyUserId) {
      permissionError = writeContext.collaborative
        ? "spotify_collaborative_write_forbidden"
        : `spotify_playlist_owned_by:${writeContext.ownerId}`;
    } else if (writeContext.ownerId && token.spotifyUserId && writeContext.ownerId === token.spotifyUserId) {
      permissionError = "spotify_owner_write_forbidden_reconnect";
    }
  }

  console.error("Spotify auto-add failed", {
    submissionId,
    playlistId: pl.spotify_playlist_id,
    trackId: sub.spotify_track_id,
    status: added.status,
    body: added.error?.slice(0, 300),
    containsError: already.error,
    connectedSpotifyUserId: token.spotifyUserId,
    playlistOwnerId: writeContext?.ownerId,
    playlistOwnerName: writeContext?.ownerName,
    playlistCollaborative: writeContext?.collaborative,
    playlistPublic: writeContext?.public,
  });
  return {
    ...autoAdd,
    connectedSpotifyUserId: token.spotifyUserId,
    playlistOwnerId: writeContext?.ownerId ?? null,
    playlistOwnerName: writeContext?.ownerName ?? null,
    playlistCollaborative: writeContext?.collaborative ?? null,
    error:
      added.status === 401
        ? "spotify_unauthorized_reconnect"
        : added.status === 403
          ? permissionError
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
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      try {
        autoAdd = await addSubmissionTrackToSpotify(data.id, context.userId, supabaseAdmin);
      } catch (e: any) {
        autoAdd.error = e?.message ?? "auto_add_failed";
      }
      await recordSpotifyAddResult(supabaseAdmin, data.id, autoAdd);
    }

    return { ok: true, autoAdd };
  });

async function recordSpotifyAddResult(supabaseAdmin: any, id: string, autoAdd: SpotifyAutoAddResult) {
  const ok = !!(autoAdd.added || autoAdd.alreadyOnPlaylist);
  await supabaseAdmin
    .from("curator_submissions")
    .update({ added_to_spotify: ok, spotify_error: ok ? null : (autoAdd.error ?? "spotify_add_failed") })
    .eq("id", id);
}

export const addCuratorSubmissionToSpotify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    if (!data.id) throw new Error("Submission is required");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const autoAdd = await addSubmissionTrackToSpotify(data.id, context.userId, supabaseAdmin);
    await recordSpotifyAddResult(supabaseAdmin, data.id, autoAdd);
    return { ok: !autoAdd.error || autoAdd.added || autoAdd.alreadyOnPlaylist, autoAdd };
  });

/** Curator added the approved track by hand in Spotify. */
export const markCuratorSubmissionAdded = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("curator_submissions")
      .select("id, curator_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!sub || sub.curator_id !== context.userId) throw new Error("Submission not found");
    if (sub.status !== "approved") throw new Error("Only approved submissions can be marked added");
    const { error } = await supabaseAdmin
      .from("curator_submissions")
      .update({ added_to_spotify: true, spotify_error: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
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

    if (data.playlistId.startsWith("beta:")) {
      const appTok = await getAppToken();
      const meta = await fetchTrackMeta(trackId, appTok);
      if (!meta) throw new Error("Track not found on Spotify");
      const { submitBetaPoolTrack } = await import("./beta-curator.functions");
      const r = await submitBetaPoolTrack(
        supabaseAdmin,
        context.supabase,
        context.userId,
        data.playlistId.slice(5),
        trackId,
        meta.name ?? null,
      );
      return {
        id: r.id,
        cost: r.cost,
        followedAll: false,
        playlistName: r.playlistName,
        trackName: meta.name ?? null,
        newBalance: r.newBalance,
      };
    }

    // Load playlist
    const { data: pl } = await supabaseAdmin
      .from("curator_playlists")
      .select("id, spotify_playlist_id, curator_id")
      .eq("id", data.playlistId)
      .maybeSingle();
    if (!pl) throw new Error("Playlist not found");

    // Reject tracks that are already waiting for review or already on the playlist
    const { data: pendingDup } = await supabaseAdmin
      .from("curator_submissions")
      .select("id")
      .eq("curator_playlist_id", pl.id)
      .eq("spotify_track_id", trackId)
      .eq("status", "pending")
      .limit(1);
    if ((pendingDup ?? []).length > 0) {
      throw new Error("That track has already been submitted and is waiting for review");
    }
    let liveIds: Set<string> | null = null;
    try {
      const { fetchBetaPublicPlaylistTracks } = await import("./beta-spotify.server");
      const live = await fetchBetaPublicPlaylistTracks(pl.spotify_playlist_id as string);
      liveIds = new Set(live.map((t) => t.id));
    } catch {
      /* fall back to submission history below */
    }
    if (liveIds?.has(trackId)) {
      throw new Error("That track is already on this playlist — pick a different track");
    }

    // App-level token for public metadata
    const appToken = await getAppToken();
    const trackMeta = await fetchTrackMeta(trackId, appToken);
    if (!trackMeta) throw new Error("Track not found on Spotify");

    // Follow bonus removed — flat 50 pts for everyone
    const followedAll = false;

    const trackUrl = `https://open.spotify.com/track/${trackId}`;
    const { data: submissionId, error } = await context.supabase.rpc("submit_curator_track", {
      _playlist_id: data.playlistId,
      _spotify_track_id: trackId,
      _spotify_track_url: trackUrl,
      _spotify_track_name: trackMeta.name ?? undefined,
      _followed_all: followedAll,
    });
    if (error) throw new Error(error.message);

    const { data: subRow } = await supabaseAdmin
      .from("curator_submissions")
      .select("cost_points")
      .eq("id", submissionId as string)
      .maybeSingle();
    const cost = Number(subRow?.cost_points ?? 50);

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

export const submitOsgCuratorTrack = createServerFn({ method: "POST" })
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

    const { data: pl } = await supabaseAdmin
      .from("curator_playlists")
      .select("id, name, is_osg")
      .eq("id", data.playlistId)
      .maybeSingle();
    if (!pl) throw new Error("Playlist not found");
    if (!pl.is_osg) throw new Error("Not an OSG Artists playlist");

    const appToken = await getAppToken();
    const trackMeta = await fetchTrackMeta(trackId, appToken);
    if (!trackMeta) throw new Error("Track not found on Spotify");

    const trackUrl = `https://open.spotify.com/track/${trackId}`;
    const { data: submissionId, error } = await context.supabase.rpc(
      "submit_osg_curator_track",
      {
        _playlist_id: data.playlistId,
        _spotify_track_id: trackId,
        _spotify_track_url: trackUrl,
        _spotify_track_name: trackMeta.name ?? undefined,
      },
    );
    if (error) throw new Error(error.message);

    return {
      id: submissionId as string,
      playlistName: pl.name ?? "OSG playlist",
      trackName: trackMeta.name ?? null,
    };
  });

async function getUserAccessTokenForFollow(
  userId: string,
  supabaseAdmin: any,
): Promise<{ accessToken?: string; error?: string }> {
  const { data: conn } = await supabaseAdmin
    .from("spotify_connections")
    .select("access_token, refresh_token, expires_at, scope")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conn) return { error: "spotify_not_connected" };
  const scope = String(conn.scope ?? "");
  if (!/\buser-follow-modify\b/.test(scope)) {
    return { error: "spotify_missing_follow_scope" };
  }
  const expiresAt = new Date(conn.expires_at).getTime();
  if (Date.now() < expiresAt - 30_000) {
    return { accessToken: conn.access_token as string };
  }
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
  if (!res.ok) return { error: "spotify_refresh_failed_reconnect" };
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

function hasSpotifyScopes(scope: string, required: string[]): boolean {
  const granted = new Set(scope.split(/\s+/).filter(Boolean));
  return required.every((s) => granted.has(s));
}

async function getUserAccessTokenForPlaylistRead(
  userId: string,
  supabaseAdmin: any,
): Promise<{ accessToken?: string; error?: string }> {
  const { data: conn } = await supabaseAdmin
    .from("spotify_connections")
    .select("access_token, refresh_token, expires_at, scope")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conn) return { error: "spotify_not_connected" };

  const scope = String(conn.scope ?? "");
  if (!hasSpotifyScopes(scope, ["playlist-read-private", "playlist-read-collaborative"])) {
    return { error: "spotify_missing_playlist_read_scope" };
  }

  const expiresAt = new Date(conn.expires_at).getTime();
  if (Date.now() < expiresAt - 30_000) {
    return { accessToken: conn.access_token as string };
  }

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
  if (!res.ok) return { error: "spotify_refresh_failed_reconnect" };
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

export const followAllArtistsOnOsgPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string }) => {
    const playlistId = String(data?.playlistId ?? "").trim();
    if (!playlistId) throw new Error("playlistId required");
    return { playlistId };
  })
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pl, error: plErr } = await supabaseAdmin
      .from("curator_playlists")
      .select("id, curator_id, spotify_playlist_id, is_osg, name")
      .eq("id", data.playlistId)
      .maybeSingle();
    if (plErr) throw new Error(plErr.message);
    if (!pl) throw new Error("Playlist not found");
    if (!pl.is_osg) throw new Error("Not an OSG playlist");

    if (pl.curator_id !== context.userId) {
      const { data: ok } = await supabaseAdmin.rpc("is_accepted_invitee", {
        _curator: pl.curator_id,
        _user: context.userId,
      });
      if (!ok) throw new Error("Not a member of this OSG playlist");
    }

    const tokenRes = await getUserAccessTokenForFollow(context.userId, supabaseAdmin);
    if (tokenRes.error || !tokenRes.accessToken) {
      throw new Error(tokenRes.error ?? "spotify_error");
    }

    let artistIds = await fetchOsgFollowListArtistIds(pl.curator_id, supabaseAdmin);
    let artistSource: "artist_links" | "playlist" | "submitted_tracks" = "artist_links";
    let lastPlaylistFetchError: unknown = null;
    let curatorReadError: string | null = null;
    const readTokens: Array<{ label: string; accessToken: string }> = [];

    if (artistIds.length === 0) {
      artistSource = "playlist";
      const curatorRead = await getUserAccessTokenForPlaylistRead(pl.curator_id, supabaseAdmin);
      if (curatorRead.accessToken) {
        readTokens.push({ label: "curator", accessToken: curatorRead.accessToken });
      } else {
        curatorReadError = curatorRead.error ?? null;
      }

      if (pl.curator_id !== context.userId) {
        const userRead = await getUserAccessTokenForPlaylistRead(context.userId, supabaseAdmin);
        if (userRead.accessToken) {
          readTokens.push({ label: "member", accessToken: userRead.accessToken });
        }
      }

      for (const readToken of readTokens) {
        try {
          artistIds = await fetchPlaylistArtistIds(pl.spotify_playlist_id, readToken.accessToken);
          lastPlaylistFetchError = null;
          break;
        } catch (e) {
          console.warn(`Playlist fetch with ${readToken.label} token failed`, e);
          lastPlaylistFetchError = e;
        }
      }

      if (artistIds.length === 0) {
        try {
          const appToken = await getAppToken();
          artistIds = await fetchPlaylistArtistIds(pl.spotify_playlist_id, appToken);
          lastPlaylistFetchError = null;
        } catch (e) {
          console.warn("Playlist fetch with app token failed", e);
          lastPlaylistFetchError = e;
        }
      }
    }

    if (artistIds.length === 0) {
      const appToken = await getAppToken();
      artistIds = await fetchSubmittedTrackArtistIds(pl.id, supabaseAdmin, appToken);
      if (artistIds.length > 0) {
        artistSource = "submitted_tracks";
        lastPlaylistFetchError = null;
      }
    }

    if (artistIds.length === 0 && lastPlaylistFetchError) {
      if (curatorReadError === "spotify_missing_playlist_read_scope" || curatorReadError === "spotify_refresh_failed_reconnect") {
        throw new Error("spotify_curator_reconnect_playlist_scope");
      }
      throw lastPlaylistFetchError;
    }
    if (artistIds.length === 0) {
      return { followed: 0, total: 0, source: artistSource };
    }

    let followed = 0;
    for (let i = 0; i < artistIds.length; i += 50) {
      const chunk = artistIds.slice(i, i + 50);
      const url = `https://api.spotify.com/v1/me/following?type=artist&ids=${chunk.join(",")}`;
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${tokenRes.accessToken}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("Spotify follow failed", { status: res.status, body: body.slice(0, 300) });
        if (res.status === 401 || res.status === 403) {
          throw new Error("spotify_missing_follow_scope");
        }
        throw new Error(`spotify_follow_failed_${res.status}`);
      }
      followed += chunk.length;
    }

    return { followed, total: artistIds.length, source: artistSource };
  });

export const listPoolPlaylists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any).rpc("list_pool_playlists");
    if (error) throw new Error(error.message);
    type Row = {
      id: string;
      curator_id: string;
      curator_username: string;
      spotify_playlist_id: string;
      name: string;
      image_url: string | null;
      available_points: number;
      daily_submission_limit: number | null;
      track_hold_days: number | null;
      source?: "spotify" | "lastfm";
    };
    const rows: Row[] = ((data ?? []) as Row[]).map((r) => ({ ...r, source: "spotify" as const }));

    // Last.fm stream tracker playlists that joined the Curator Pool
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: beta } = await (supabaseAdmin as any)
      .from("beta_room_playlists")
      .select("id, spotify_playlist_id, name, image_url, track_hold_days, daily_submission_limit, beta_rooms!inner(owner_id, daily_submission_limit)")
      .eq("accept_pool_submissions", true)
      .eq("is_team", false);
    const ownerIds = Array.from(new Set((beta ?? []).map((b: any) => b.beta_rooms.owner_id)));
    const { data: profs } = ownerIds.length
      ? await supabaseAdmin.from("profiles").select("id, username").in("id", ownerIds as string[])
      : { data: [] as any[] };
    const names = new Map((profs ?? []).map((p: any) => [p.id, p.username ?? "curator"]));
    for (const b of beta ?? []) {
      if (b.beta_rooms.owner_id === context.userId) continue;
      rows.push({
        id: `beta:${b.id}`,
        curator_id: b.beta_rooms.owner_id,
        curator_username: names.get(b.beta_rooms.owner_id) ?? "curator",
        spotify_playlist_id: b.spotify_playlist_id,
        name: b.name,
        image_url: b.image_url,
        available_points: 0,
        daily_submission_limit: b.daily_submission_limit ?? b.beta_rooms.daily_submission_limit ?? 2,
        track_hold_days: b.track_hold_days,
        source: "lastfm",
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  });

export const setCuratorPlaylistPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; on: boolean }) => ({ playlistId: String(data.playlistId), on: Boolean(data.on) }))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("set_curator_playlist_pool", { _playlist_id: data.playlistId, _on: data.on });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
