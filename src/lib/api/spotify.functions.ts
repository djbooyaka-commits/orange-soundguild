import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { signState } from "./spotify-state.server";

const SCOPES =
  "user-read-recently-played user-read-email user-follow-read user-follow-modify playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private";


function getRedirectUri(): string {
  const proto = getRequestHeader("x-forwarded-proto") || "https";
  const host = getRequestHost();
  return `${proto}://${host}/api/public/spotify/callback`;
}

async function getSpotifyCredsForUser(
  userId: string,
  supabaseAdmin: any,
): Promise<{ clientId: string; clientSecret: string; custom: boolean }> {
  const { data } = await supabaseAdmin
    .from("spotify_user_apps")
    .select("client_id, client_secret")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.client_id && data?.client_secret) {
    return { clientId: data.client_id, clientSecret: data.client_secret, custom: true };
  }
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Spotify not configured");
  return { clientId, clientSecret, custom: false };
}

export const getSpotifyAuthUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { clientId } = await getSpotifyCredsForUser(context.userId, supabaseAdmin);
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
    const { data } = await (supabaseAdmin as any)
      .from("spotify_connections")
      .select("spotify_user_id, last_polled_at, created_at, auto_sync_until")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { data: appRow } = await supabaseAdmin
      .from("spotify_user_apps")
      .select("client_id, created_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { data: pts } = await context.supabase.rpc("get_my_stream_points");

    // Today's points grouped by hour, plus the most recent play, so members can
    // see the app working in real time without needing to press Sync now.
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data: todayRows } = await (supabaseAdmin as any)
      .from("stream_points")
      .select("played_at")
      .eq("user_id", context.userId)
      .gte("played_at", startOfDay.toISOString())
      .order("played_at", { ascending: false });
    const hourly: { hour: number; count: number }[] = [];
    const byHour = new Map<number, number>();
    let lastPlayAt: string | null = null;
    for (const r of todayRows ?? []) {
      const pa = r.played_at as string;
      if (!lastPlayAt) lastPlayAt = pa;
      const h = new Date(pa).getHours();
      byHour.set(h, (byHour.get(h) ?? 0) + 1);
    }
    for (let h = 0; h < 24; h++) {
      const count = byHour.get(h) ?? 0;
      if (count > 0) hourly.push({ hour: h, count });
    }
    hourly.sort((a, b) => a.hour - b.hour);

    return {
      connected: !!data,
      spotifyUserId: (data?.spotify_user_id as string | null) ?? null,
      lastPolledAt: (data?.last_polled_at as string | null) ?? null,
      autoSyncUntil: (data?.auto_sync_until as string | null) ?? null,
      points: (pts as number | null) ?? 0,
      hasCustomApp: !!appRow,
      customClientId: appRow?.client_id ?? null,
      hourly,
      lastPlayAt,
      todayTotal: (todayRows ?? []).length,
    };
  });

export const setMySpotifyApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { clientId: string; clientSecret: string }) => {
    const clientId = String(data?.clientId ?? "").trim();
    const clientSecret = String(data?.clientSecret ?? "").trim();
    if (!/^[a-f0-9]{32}$/i.test(clientId)) throw new Error("Client ID must be 32 hex characters");
    if (!/^[a-f0-9]{32}$/i.test(clientSecret)) throw new Error("Client Secret must be 32 hex characters");
    return { clientId, clientSecret };
  })
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Changing app invalidates the current connection (tokens were issued by the old app)
    await supabaseAdmin.from("spotify_connections").delete().eq("user_id", context.userId);
    const { error } = await supabaseAdmin
      .from("spotify_user_apps")
      .upsert(
        {
          user_id: context.userId,
          client_id: data.clientId,
          client_secret: data.clientSecret,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMySpotifyApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("spotify_connections").delete().eq("user_id", context.userId);
    await supabaseAdmin.from("spotify_user_apps").delete().eq("user_id", context.userId);
    return { ok: true };
  });

export const disconnectSpotify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("spotify_connections").delete().eq("user_id", context.userId);
    return { ok: true };
  });

async function refreshIfNeeded(
  conn: {
    user_id: string;
    access_token: string;
    refresh_token: string;
    expires_at: string;
  },
  supabaseAdmin: any,
) {
  const expiresAt = new Date(conn.expires_at).getTime();
  if (Date.now() < expiresAt - 30_000) return conn.access_token;

  const { clientId, clientSecret } = await getSpotifyCredsForUser(conn.user_id, supabaseAdmin);
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

export async function pollSpotifyRecentForUser(userId: string, supabaseAdmin: any) {
    const { data: conn } = await supabaseAdmin
      .from("spotify_connections")
      .select("user_id, access_token, refresh_token, expires_at, last_polled_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (!conn) return { added: 0, connected: false };

    let accessToken: string;
    try {
      accessToken = await refreshIfNeeded(conn as any, supabaseAdmin);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (msg.includes("invalid_grant")) {
        // Authorization revoked: drop the dead link so the card asks the user to reconnect
        // and background polling stops retrying it forever.
        await supabaseAdmin.from("spotify_connections").delete().eq("user_id", userId);
        return { added: 0, connected: false, error: "spotify_reconnect_required" };
      }
      console.error("Spotify refresh error", e);
      return { added: 0, connected: false, error: "refresh_failed" };
    }

    // Overlap the window slightly: Spotify can report plays a few minutes late.
    const OVERLAP_MS = 15 * 60 * 1000;
    const after = conn.last_polled_at
      ? new Date(conn.last_polled_at).getTime() - OVERLAP_MS
      : Date.now() - 24 * 60 * 60 * 1000;

    // Spotify retains only a short recent-play history. Frequent background
    // polling prevents an overnight session from overflowing that window.
    const items: any[] = [];
    const recentUrl = new URL("https://api.spotify.com/v1/me/player/recently-played");
    recentUrl.searchParams.set("limit", "50");
    recentUrl.searchParams.set("after", String(after));
    {
      let res: Response = await fetch(recentUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      // Spotify rate limit: honour Retry-After once for short waits.
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "0");
        if (retryAfter > 0 && retryAfter <= 5) {
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          res = await fetch(recentUrl.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        }
        if (res.status === 429) {
          return {
            added: 0,
            connected: true,
            error: "spotify_rate_limited",
            retryAfter: Number(res.headers.get("retry-after") ?? retryAfter) || null,
          };
        }
      }
      if (!res.ok) {
        const t = await res.text();
        console.error(`Spotify recently-played failed [${res.status}]: ${t}`);
        const lower = t.toLowerCase();
        const isUnregisteredSpotifyUser =
          res.status === 403 && lower.includes("not registered for this application");
        // NOTE: recently-played works for FREE Spotify accounts. A 403 here is
        // almost always the app's dev-mode allowed-users cap, not a Premium issue.
        return {
          added: 0,
          connected: true,
          error:
            isUnregisteredSpotifyUser || res.status === 403
              ? "spotify_account_not_allowed"
              : `spotify_${res.status}`,
        };
      }
      const body: any = await res.json();
      const pageItems: any[] = body.items ?? [];
      items.push(...pageItems);
    }



    const { data: playlists } = await supabaseAdmin
      .from("curator_playlists")
      .select("id, spotify_playlist_id, curator_id");
    const byId = new Map<string, { cpId: string; curatorId: string }>();
    for (const p of playlists ?? []) byId.set(p.spotify_playlist_id, { cpId: p.id, curatorId: p.curator_id });

    const inviteeCache = new Map<string, boolean>();
    const isInvitee = async (curatorId: string) => {
      if (curatorId === userId) return true;
      const cached = inviteeCache.get(curatorId);
      if (cached !== undefined) return cached;
      const { data } = await supabaseAdmin.rpc("is_accepted_invitee", {
        _curator: curatorId,
        _user: userId,
      });
      const ok = !!data;
      inviteeCache.set(curatorId, ok);
      return ok;
    };

    const sorted = [...items].sort(
      (a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime(),
    );

    let added = 0;
    let skippedNotCurated = 0;
    let maxEvaluatedAt: number | null = null;

    for (const item of sorted) {
      const playedAtMs = new Date(item.played_at).getTime();
      maxEvaluatedAt = Math.max(maxEvaluatedAt ?? 0, playedAtMs);

      const ctx = item.context;
      if (!ctx || ctx.type !== "playlist") { skippedNotCurated++; continue; }
      const uri: string = ctx.uri || "";
      // Spotify may append query params (e.g. "?sessionId=...&mode=enhanced")
      // to the playlist URI, so match the id and ignore anything after it.
      const m = uri.match(/^spotify:playlist:([A-Za-z0-9]+)/);

      if (!m) { skippedNotCurated++; continue; }
      const match = byId.get(m[1]);
      if (!match) { skippedNotCurated++; continue; }
      if (!(await isInvitee(match.curatorId))) { skippedNotCurated++; continue; }

      const track = item.track;
      if (!track?.id) continue;

      // Spotify's recently-played only reports tracks played long enough to count,
      // so we credit every match. Dedup handled by unique (user_id, spotify_track_id, played_at).
      const { error } = await supabaseAdmin.from("stream_points").insert({
        user_id: userId,
        curator_playlist_id: match.cpId,
        spotify_track_id: track.id,
        spotify_track_name: track.name ?? null,
        played_at: item.played_at,
      });
      if (!error) added += 1;
    }

    // Only advance the cursor to the newest play we actually saw. Advancing to
    // "now" on an empty response would skip plays Spotify reports late.
    const updates: Record<string, string> = {};
    if (maxEvaluatedAt != null) updates.last_polled_at = new Date(maxEvaluatedAt).toISOString();
    // Streaming a Curator playlist keeps auto-sync alive for 2 more hours.
    if (added > 0) updates.auto_sync_until = new Date(Date.now() + AUTO_SYNC_WINDOW_MS).toISOString();
    if (Object.keys(updates).length) {
      await supabaseAdmin.from("spotify_connections").update(updates).eq("user_id", userId);
    }

    return {
      added,
      connected: true,
      scanned: sorted.length,
      skippedNotCurated,
    };
}

export const AUTO_SYNC_WINDOW_MS = 2 * 60 * 60 * 1000;

export const pollSpotifyRecent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { manual?: boolean } | undefined) => ({ manual: !!d?.manual }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.manual) {
      await (supabaseAdmin as any)
        .from("spotify_connections")
        .update({ auto_sync_until: new Date(Date.now() + AUTO_SYNC_WINDOW_MS).toISOString() })
        .eq("user_id", context.userId);
    }
    return pollSpotifyRecentForUser(context.userId, supabaseAdmin);
  });
