import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SCOPES = "user-read-recently-played user-read-email";

function getRedirectUri(): string {
  const proto = getRequestHeader("x-forwarded-proto") || "https";
  const host = getRequestHost();
  return `${proto}://${host}/api/public/spotify/callback`;
}

export const getSpotifyAuthUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    if (!clientId) throw new Error("Spotify not configured");
    const redirectUri = getRedirectUri();
    const state = signState(context.userId, Date.now() + 10 * 60 * 1000);
    const url = new URL("https://accounts.spotify.com/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("state", state);
    return { url: url.toString() };
  });

export const getMySpotifyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("spotify_connections")
      .select("spotify_user_id, last_polled_at, created_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { data: pts } = await context.supabase.rpc("get_my_stream_points");
    return {
      connected: !!data,
      spotifyUserId: data?.spotify_user_id ?? null,
      lastPolledAt: data?.last_polled_at ?? null,
      points: (pts as number | null) ?? 0,
    };
  });

export const disconnectSpotify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("spotify_connections").delete().eq("user_id", context.userId);
    return { ok: true };
  });

async function refreshIfNeeded(conn: {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
}, supabaseAdmin: any) {
  const expiresAt = new Date(conn.expires_at).getTime();
  if (Date.now() < expiresAt - 30_000) return conn.access_token;

  const clientId = process.env.SPOTIFY_CLIENT_ID!;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
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
    const t = await res.text();
    throw new Error(`Spotify refresh failed [${res.status}]: ${t}`);
  }
  const json = await res.json();
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
    .eq("user_id", conn.user_id);
  return newAccess;
}

export const pollSpotifyRecent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: conn } = await supabaseAdmin
      .from("spotify_connections")
      .select("user_id, access_token, refresh_token, expires_at, last_polled_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!conn) return { added: 0, connected: false };

    let accessToken: string;
    try {
      accessToken = await refreshIfNeeded(conn as any, supabaseAdmin);
    } catch (e) {
      console.error("Spotify refresh error", e);
      return { added: 0, connected: false, error: "refresh_failed" };
    }

    const after = conn.last_polled_at ? new Date(conn.last_polled_at).getTime() : Date.now() - 24 * 60 * 60 * 1000;
    const url = new URL("https://api.spotify.com/v1/me/player/recently-played");
    url.searchParams.set("limit", "50");
    url.searchParams.set("after", String(after));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const t = await res.text();
      console.error(`Spotify recently-played failed [${res.status}]: ${t}`);
      return { added: 0, connected: true, error: `spotify_${res.status}` };
    }
    const body = await res.json();
    const items: any[] = body.items ?? [];

    // Load all curator playlists once
    const { data: playlists } = await supabaseAdmin
      .from("curator_playlists")
      .select("id, spotify_playlist_id");
    const byId = new Map<string, string>();
    for (const p of playlists ?? []) byId.set(p.spotify_playlist_id, p.id);

    let added = 0;
    for (const item of items) {
      const ctx = item.context;
      if (!ctx || ctx.type !== "playlist") continue;
      const uri: string = ctx.uri || "";
      const m = uri.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
      if (!m) continue;
      const cpId = byId.get(m[1]);
      if (!cpId) continue;
      const track = item.track;
      if (!track?.id) continue;
      const { error } = await supabaseAdmin.from("stream_points").insert({
        user_id: context.userId,
        curator_playlist_id: cpId,
        spotify_track_id: track.id,
        spotify_track_name: track.name ?? null,
        played_at: item.played_at,
      });
      if (!error) added += 1;
    }

    await supabaseAdmin
      .from("spotify_connections")
      .update({ last_polled_at: new Date().toISOString() })
      .eq("user_id", context.userId);

    return { added, connected: true };
  });
