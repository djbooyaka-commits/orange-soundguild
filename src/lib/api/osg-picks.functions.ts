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

    // A member always sees their own card, even before they have streams this week.
    if (memberIds.includes(userId) && !byUser.has(userId)) byUser.set(userId, new Map());

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

/** Curator removes every OSG Artist's points in one go; batch id lets Undo reverse it. */
export const osgRemoveAllPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const me = context.userId;
    const { data: picks } = await supabaseAdmin.from("osg_artist_picks").select("artist_id").eq("user_id", me);
    const ids = Array.from(new Set((picks ?? []).map((p: any) => p.artist_id as string)));
    if (!ids.length) throw new Error("No members to clear");
    const { data: pls } = await supabaseAdmin.from("curator_playlists").select("id").eq("curator_id", me).eq("is_osg", true);
    const plIds = (pls ?? []).map((p: any) => p.id as string);
    const { data: adjs } = await supabaseAdmin.from("osg_point_adjustments").select("user_id, delta").eq("curator_id", me).in("user_id", ids);
    const adjBy = new Map<string, number>();
    for (const a of (adjs ?? []) as any[]) adjBy.set(a.user_id, (adjBy.get(a.user_id) ?? 0) + Number(a.delta));
    const batchId = crypto.randomUUID();
    const rows: any[] = [];
    for (const uid of ids) {
      let earned = 0;
      if (plIds.length) {
        const { count } = await supabaseAdmin.from("stream_points").select("id", { count: "exact", head: true }).eq("user_id", uid).in("curator_playlist_id", plIds);
        earned = count ?? 0;
      }
      const bal = earned + (adjBy.get(uid) ?? 0);
      if (bal > 0) rows.push({ curator_id: me, user_id: uid, delta: -bal, reason: "Curator removed all points", batch_id: batchId });
    }
    if (!rows.length) throw new Error("No members have points to remove");
    const { error } = await supabaseAdmin.from("osg_point_adjustments").insert(rows);
    if (error) throw new Error(error.message);
    return { batchId, members: rows.length, points: rows.reduce((s, r) => s - r.delta, 0) };
  });

export const osgUndoRemoveAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { batchId: string }) => ({ batchId: String(data?.batchId ?? "") }))
  .handler(async ({ data, context }) => {
    if (!data.batchId) throw new Error("Nothing to undo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: del, error } = await supabaseAdmin.from("osg_point_adjustments").delete()
      .eq("curator_id", context.userId).eq("batch_id", data.batchId).select("id");
    if (error) throw new Error(error.message);
    return { restored: del?.length ?? 0 };
  });

export const osgLastRemoveAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("osg_point_adjustments").select("batch_id")
      .eq("curator_id", context.userId).not("batch_id", "is", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    return row?.batch_id ? { batchId: row.batch_id as string } : null;
  });

const OSG_PERIOD_DAYS = 7;

/** Curator picks how many red stars (1–7) take an OSG Artist's tracks off the OSG Spotify playlist, or Off. */
export const osgSetAutoRemoveStars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { stars: number | null }) => {
    const n = Math.trunc(Number(data?.stars) || 0);
    return { stars: n >= 1 && n <= 7 ? n : null };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pls, error } = await supabaseAdmin
      .from("curator_playlists")
      .update({ auto_remove_stars: data.stars })
      .eq("curator_id", context.userId)
      .eq("is_osg", true)
      .select("id");
    if (error) throw new Error(error.message);
    if (!pls?.length) throw new Error("You don't have an OSG playlist yet");
    return { ok: true };
  });

/**
 * Removes OSG Artists' tracks from the curator's OSG Spotify playlist(s) once their red stars
 * reach the threshold, and restores them once they meet the minimum or get a pass.
 * Returns the threshold and which members currently have tracks removed.
 */
export const osgSyncAutoRemovals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { curatorId: string }) => ({ curatorId: z.string().uuid().parse(data?.curatorId) }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const curatorId = data.curatorId;
    const { data: picks } = await supabaseAdmin
      .from("osg_artist_picks")
      .select("artist_id, created_at")
      .eq("user_id", curatorId);
    const members = (picks ?? []) as { artist_id: string; created_at: string | null }[];
    if (context.userId !== curatorId && !members.some((m) => m.artist_id === context.userId)) {
      throw new Error("Only room members can view this");
    }
    const { data: pls } = await supabaseAdmin
      .from("curator_playlists")
      .select("id, spotify_playlist_id, auto_remove_stars")
      .eq("curator_id", curatorId)
      .eq("is_osg", true);
    const playlists = (pls ?? []).filter((p: any) => p.spotify_playlist_id);
    const threshold = (playlists.find((p: any) => p.auto_remove_stars)?.auto_remove_stars as number | undefined) ?? null;
    if (!playlists.length) return { autoRemoveStars: null, removedUserIds: [] as string[] };
    const plIds = playlists.map((p: any) => p.id as string);

    try {
      const { data: existing } = await supabaseAdmin
        .from("curator_team_auto_removals")
        .select("user_id")
        .in("playlist_id", plIds)
        .limit(1);
      // Only touch Spotify when the feature is on, or tracks still need restoring.
      if ((threshold || existing?.length) && members.length) {
        const ids = members.map((m) => m.artist_id);
        const [{ data: adjs }, { data: targets }, { data: cur }] = await Promise.all([
          supabaseAdmin.from("osg_point_adjustments").select("user_id, delta, created_at").eq("curator_id", curatorId).in("user_id", ids),
          supabaseAdmin.from("osg_member_targets").select("user_id, target_min").eq("curator_id", curatorId).in("user_id", ids),
          supabaseAdmin.from("profiles").select("osg_weekly_min").eq("id", curatorId).maybeSingle(),
        ]);
        const adjSum = new Map<string, number>();
        const lastDed = new Map<string, string>();
        for (const a of (adjs ?? []) as any[]) {
          adjSum.set(a.user_id, (adjSum.get(a.user_id) ?? 0) + Number(a.delta));
          if (a.delta < 0 && (!lastDed.get(a.user_id) || a.created_at > lastDed.get(a.user_id)!))
            lastDed.set(a.user_id, a.created_at);
        }
        const targetBy = new Map(((targets ?? []) as any[]).map((t) => [t.user_id, Number(t.target_min)]));
        const roomMin = Number((cur as any)?.osg_weekly_min) || 600;
        const pointsBy = new Map<string, number>();
        await Promise.all(
          ids.map(async (uid) => {
            const { count } = await supabaseAdmin
              .from("stream_points")
              .select("id", { count: "exact", head: true })
              .eq("user_id", uid)
              .in("curator_playlist_id", plIds);
            pointsBy.set(uid, Math.max(0, (count ?? 0) + (adjSum.get(uid) ?? 0)));
          }),
        );

        const { syncAutoRemovals, hasRecentPass } = await import("./beta-auto-remove.server");
        const { parseSpotifyTrackId } = await import("./beta-spotify.server");
        const { getCuratorAccessToken } = await import("./curator-submissions.functions");
        const tok: any = await getCuratorAccessToken(curatorId, supabaseAdmin);
        const accessToken = (tok?.accessToken as string) ?? null;

        const memberRows = members.map((m) => {
          const last = lastDed.get(m.artist_id) ?? null;
          const min = targetBy.get(m.artist_id) || roomMin;
          const pts = pointsBy.get(m.artist_id) ?? 0;
          return {
            user_id: m.artist_id,
            joined_at: m.created_at ?? null,
            last_deduction_at: last,
            // Same rule as the card: a pass, or meeting the minimum, keeps tracks on the playlist.
            passed: hasRecentPass(last, OSG_PERIOD_DAYS) || pts >= min,
          };
        });
        const trackIdsByUser = async (uids: string[]) => {
          const [{ data: links }, { data: subs }] = await Promise.all([
            supabaseAdmin.from("osg_artist_follow_links").select("user_id, track_urls").eq("curator_id", curatorId).in("user_id", uids),
            supabaseAdmin
              .from("curator_submissions")
              .select("submitter_user_id, spotify_track_id")
              .in("curator_playlist_id", plIds)
              .eq("status", "approved")
              .in("submitter_user_id", uids),
          ]);
          const out = new Map<string, string[]>();
          const add = (uid: string, id: string | null) => {
            if (!id) return;
            const arr = out.get(uid) ?? [];
            if (!arr.includes(id)) arr.push(id);
            out.set(uid, arr);
          };
          for (const l of (links ?? []) as any[])
            for (const u of (l.track_urls as string[] | null) ?? []) add(l.user_id, u ? parseSpotifyTrackId(u) : null);
          for (const s of (subs ?? []) as any[]) add(s.submitter_user_id, s.spotify_track_id ?? null);
          return out;
        };
        for (const p of playlists as any[]) {
          await syncAutoRemovals(supabaseAdmin, {
            playlistId: p.id,
            spotifyPlaylistId: p.spotify_playlist_id,
            ownerId: curatorId,
            threshold,
            periodDays: OSG_PERIOD_DAYS,
            members: memberRows,
            removalsTable: "curator_team_auto_removals",
            accessToken,
            trackIdsByUser,
          });
        }
      }
    } catch (e) {
      console.error("OSG auto-remove sync failed", e);
    }
    const { data: rows } = await supabaseAdmin
      .from("curator_team_auto_removals")
      .select("user_id")
      .in("playlist_id", plIds);
    return {
      autoRemoveStars: threshold,
      removedUserIds: Array.from(new Set((rows ?? []).map((r: any) => r.user_id as string))),
    };
  });
