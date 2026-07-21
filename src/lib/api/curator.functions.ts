import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SpotifyPlaylistMeta = {
  name?: string;
  images?: Array<{ url?: string }>;
  owner?: { id?: string; display_name?: string | null };
};

function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  const uriMatch = trimmed.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
  if (uriMatch) return uriMatch[1];
  const urlMatch = trimmed.match(/playlist\/([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9]{16,}$/.test(trimmed)) return trimmed;
  return null;
}

function hasPlaylistModifyScope(scope: string): boolean {
  return /\bplaylist-modify-(public|private)\b/.test(scope);
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
    `https://api.spotify.com/v1/playlists/${spotifyId}?fields=name,images,owner(id,display_name)`,
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
    const { accessToken, spotifyUserId } = await getCuratorSpotifyAccess(context.userId, supabaseAdmin);
    const meta = await fetchPlaylistMeta(spotifyId, accessToken);
    if (meta.owner?.id && spotifyUserId && meta.owner.id !== spotifyUserId) {
      throw new Error(
        "This playlist is owned by another Spotify account. Connect the Spotify account that owns it, then add it again.",
      );
    }

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

export const removeCuratorPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("curator_playlists")
      .delete()
      .eq("id", data.id)
      .eq("curator_id", context.userId);
    return { ok: true };
  });

export const listMyCuratorPlaylists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("curator_playlists")
      .select("id, spotify_playlist_id, name, image_url, created_at")
      .eq("curator_id", context.userId)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const getCuratorEarnedPoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("get_curator_earned_points");
    return { points: (data as number | null) ?? 0 };
  });
