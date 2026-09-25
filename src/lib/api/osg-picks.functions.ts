import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function extractArtistId(input: string): string | null {
  const trimmed = input.trim();
  const uri = trimmed.match(/^spotify:artist:([A-Za-z0-9]+)$/);
  if (uri) return uri[1];
  const url = trimmed.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?artist\/([A-Za-z0-9]+)/i);
  if (url) return url[1];
  if (/^[A-Za-z0-9]{16,}$/.test(trimmed)) return trimmed;
  return null;
}

async function getSpotifyAppToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Spotify is not configured");
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("Spotify artist lookup failed");
  const json = await res.json();
  return json.access_token as string;
}

async function fetchArtistMeta(artistId: string) {
  const token = await getSpotifyAppToken();
  const res = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error("Spotify artist not found");
  const json = await res.json();
  return { id: json.id as string, name: (json.name as string | undefined) ?? null };
}

export const listMyOsgArtistPicks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_my_osg_artist_picks");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      artist_id: string;
      username: string | null;
      avatar_url: string | null;
      account_type: "fan" | "artist" | "superfan" | "pioneer";
      weekly_points: number;
      weekly_min: number;
      created_at: string;
    }>;
  });

export const adjustOsgPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; delta: number; reason?: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("osg_adjust_points", {
      _user_id: data.userId,
      _delta: Math.trunc(data.delta),
      _reason: data.reason ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const setOsgWeeklyMin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { min: number }) => data)
  .handler(async ({ data, context }) => {
    const { data: value, error } = await context.supabase.rpc("osg_set_weekly_min", {
      _min: Math.trunc(data.min),
    });
    if (error) throw new Error(error.message);
    return { min: value as number };
  });


export const addOsgArtistPick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { username: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("add_osg_artist_pick", {
      _username: data.username,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const removeOsgArtistPick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { pickId: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("osg_artist_picks")
      .delete()
      .eq("id", data.pickId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const canUseOsgArtists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("can_use_osg_artists");
    if (error) throw new Error(error.message);
    return { allowed: Boolean(data) };
  });

export const listMyOsgRosters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_my_osg_rosters");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      curator_id: string;
      curator_username: string | null;
      curator_avatar_url: string | null;
      artist_id: string;
      username: string | null;
      avatar_url: string | null;
      account_type: "fan" | "artist" | "superfan" | "pioneer";
      weekly_points: number;
      weekly_min: number;
      is_me: boolean;
    }>;
  });


export const listOsgPlaylistSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_osg_playlist_submissions");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      curator_id: string;
      submitter_user_id: string;
      spotify_track_id: string;
      spotify_track_url: string;
      spotify_track_name: string | null;
      status: "pending" | "approved" | "rejected";
      created_at: string;
    }>;
  });

export const listOsgPlaylistsForSubmission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_osg_playlists_for_submission");
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

export const listOsgArtistFollowLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_osg_artist_follow_links");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      curator_id: string;
      user_id: string;
      spotify_artist_id: string;
      spotify_artist_url: string;
      spotify_artist_name: string | null;
      track_urls: string[] | null;
      updated_at: string;
    }>;
  });

const saveFollowLinkSchema = z.object({
  curatorId: z.string().uuid(),
  artistUrl: z.string().trim().min(1, "Spotify artist link is required").max(300),
});

export const saveOsgArtistFollowLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => saveFollowLinkSchema.parse(data))
  .handler(async ({ context, data }) => {
    const artistId = extractArtistId(data.artistUrl);
    if (!artistId) throw new Error("Paste a Spotify artist link, not a track or playlist link");

    let artistName: string | null = null;
    try {
      const artist = await fetchArtistMeta(artistId);
      artistName = artist.name;
    } catch (error) {
      console.warn("Spotify artist metadata lookup failed; saving artist link without name", {
        artistId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const artistUrl = `https://open.spotify.com/artist/${artistId}`;
    const { data: id, error } = await context.supabase.rpc("upsert_osg_artist_follow_link", {
      _curator_id: data.curatorId,
      _spotify_artist_id: artistId,
      _spotify_artist_url: artistUrl,
      _spotify_artist_name: artistName ?? undefined,
    });
    if (error) throw new Error(error.message);

    return { id: id as string, artistId, artistUrl, artistName };
  });

const curatorSetFollowLinkSchema = z.object({
  artistId: z.string().uuid(),
  artistUrl: z.string().trim().min(1, "Spotify artist link is required").max(300),
});

/** Curator sets the Spotify artist profile link for a member of their OSG Artists list. */
export const curatorSetOsgArtistFollowLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => curatorSetFollowLinkSchema.parse(data))
  .handler(async ({ context, data }) => {
    const spotifyArtistId = extractArtistId(data.artistUrl);
    if (!spotifyArtistId) throw new Error("Paste a Spotify artist link, not a track or playlist link");

    let artistName: string | null = null;
    try {
      const artist = await fetchArtistMeta(spotifyArtistId);
      artistName = artist.name;
    } catch (error) {
      console.warn("Spotify artist metadata lookup failed; saving artist link without name", {
        spotifyArtistId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const artistUrl = `https://open.spotify.com/artist/${spotifyArtistId}`;
    const { data: id, error } = await context.supabase.rpc("curator_set_osg_artist_follow_link", {
      _artist_id: data.artistId,
      _spotify_artist_id: spotifyArtistId,
      _spotify_artist_url: artistUrl,
      _spotify_artist_name: artistName ?? undefined,
    });
    if (error) throw new Error(error.message);

    return { id: id as string, spotifyArtistId, artistUrl, artistName };
  });

const curatorSetTrackLinksSchema = z.object({
  artistId: z.string().uuid(),
  urls: z.array(z.string().trim().max(500)).max(5),
});

/** Curator sets up to 5 track links for a member of their OSG Artists list. */
export const curatorSetOsgTrackLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => curatorSetTrackLinksSchema.parse(data))
  .handler(async ({ context, data }) => {
    const urls = data.urls.map((u) => u.trim()).filter(Boolean);
    const { data: id, error } = await (context.supabase as any).rpc("curator_set_osg_track_links", {
      _artist_id: data.artistId,
      _urls: urls,
    });
    if (error) throw new Error(error.message);
    return { id: id as string, urls };
  });

export type OsgDailyStreams = {
  user_id: string;
  username: string | null;
  days: { date: string; count: number }[];
  total: number;
};

/** Per-member daily stream counts (last 7 days) on a curator's OSG playlists. */
export const listOsgDailyStreams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { curatorId: string }) => ({
    curatorId: z.string().uuid().parse(data?.curatorId),
  }))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: picks, error: pErr } = await supabaseAdmin
      .from("osg_artist_picks")
      .select("artist_id")
      .eq("user_id", data.curatorId);
    if (pErr) throw new Error(pErr.message);
    const memberIds = (picks ?? []).map((p: any) => p.artist_id as string);
    if (userId !== data.curatorId && !memberIds.includes(userId)) {
      throw new Error("Only room members can view stream counts");
    }
    if (!memberIds.length) return [] as OsgDailyStreams[];

    const { data: pls } = await supabaseAdmin
      .from("curator_playlists")
      .select("id")
      .eq("curator_id", data.curatorId)
      .eq("is_osg", true);
    const plIds = (pls ?? []).map((p: any) => p.id as string);
    if (!plIds.length) return [] as OsgDailyStreams[];

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    // The database returns at most 1000 rows per request, so page through all of them.
    const rows: any[] = [];
    for (let from = 0; from < 100000; from += 1000) {
      const { data: page, error } = await supabaseAdmin
        .from("stream_points")
        .select("user_id, played_at")
        .in("curator_playlist_id", plIds)
        .in("user_id", memberIds)
        .gte("played_at", since)
        .order("id", { ascending: true })
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }

    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .in("id", memberIds);
    const names = new Map((profs ?? []).map((p: any) => [p.id, p.username]));

    const byUser = new Map<string, Map<string, number>>();
    (rows ?? []).forEach((r: any) => {
      const day = String(r.played_at).slice(0, 10);
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, new Map());
      const m = byUser.get(r.user_id)!;
      m.set(day, (m.get(day) ?? 0) + 1);
    });

    return Array.from(byUser.entries())
      .map(([uid, days]) => {
        const list = Array.from(days.entries())
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => (a.date < b.date ? 1 : -1));
        return {
          user_id: uid,
          username: names.get(uid) ?? null,
          days: list,
          total: list.reduce((s, d) => s + d.count, 0),
        };
      })
      .sort((a, b) => b.total - a.total) as OsgDailyStreams[];
  });
