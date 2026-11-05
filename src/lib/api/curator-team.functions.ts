import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CuratorTeamRoom = {
  playlist_id: string;
  curator_id: string;
  curator_username: string | null;
  name: string;
  image_url: string | null;
  spotify_playlist_id: string;
  team_weekly_min: number;
  is_owner: boolean;
};

export type CuratorTeamMember = {
  member_id: string;
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  account_type: "fan" | "artist" | "superfan" | "pioneer";
  points: number;
  weekly_min: number;
  is_me: boolean;
  last_deduction_at: string | null;
  spotify_artist_url: string | null;
  spotify_artist_name: string | null;
  track_urls: string[] | null;
  facebook_url: string | null;
  facebook_name: string | null;
  period_days: number;
};

export const setCuratorPlaylistIsTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; isTeam: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_curator_playlist_is_team", {
      _playlist_id: data.playlistId,
      _is_team: data.isTeam,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyCuratorTeamRooms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("list_my_curator_team_rooms");
    if (error) throw new Error(error.message);
    return (data ?? []) as CuratorTeamRoom[];
  });

export const curatorTeamRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const [{ data: rows, error }, { data: playlist, error: playlistError }] = await Promise.all([
      context.supabase.rpc("curator_team_roster", {
        _playlist_id: data.playlistId,
      }),
      context.supabase
        .from("curator_playlists")
        .select("curator_id, min_period_days")
        .eq("id", data.playlistId)
        .maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    if (playlistError) throw new Error(playlistError.message);
    const isCurator = playlist?.curator_id === context.userId;
    return (rows ?? []).map((row) => ({
      ...row,
      facebook_url: isCurator ? row.facebook_url : null,
      facebook_name: isCurator ? row.facebook_name : null,
      period_days: ((playlist as any)?.min_period_days as number | null) ?? 7,
    })) as CuratorTeamMember[];
  });

export const curatorTeamAddMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; username: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
    username: String(data?.username ?? "").trim().replace(/^@/, ""),
  }))
  .handler(async ({ data, context }) => {
    if (!data.username) throw new Error("Enter a username");
    const { error } = await context.supabase.rpc("curator_team_add_member", {
      _playlist_id: data.playlistId,
      _username: data.username,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const curatorTeamRemoveMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { memberId: string }) => ({ memberId: String(data?.memberId ?? "") }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("curator_team_remove_member", {
      _member_id: data.memberId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const curatorTeamSetLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { playlistId: string; userId: string; artistUrl?: string; urls?: string[] }) => ({
      playlistId: String(data?.playlistId ?? ""),
      userId: String(data?.userId ?? ""),
      artistUrl: String(data?.artistUrl ?? "").trim(),
      urls: (data?.urls ?? []).map((u) => String(u).trim()).filter(Boolean).slice(0, 5),
    }),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("curator_team_set_links", {
      _playlist_id: data.playlistId,
      _user_id: data.userId,
      _artist_url: data.artistUrl,
      _artist_name: "",
      _urls: data.urls,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const curatorTeamAdjustPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; userId: string; delta: number; reason?: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
    userId: String(data?.userId ?? ""),
    delta: Math.trunc(Number(data?.delta) || 0),
    reason: String(data?.reason ?? "").slice(0, 200),
  }))
  .handler(async ({ data, context }) => {
    if (!data.delta) throw new Error("Enter a number of points");
    const { error } = await context.supabase.rpc("curator_team_adjust_points", {
      _playlist_id: data.playlistId,
      _user_id: data.userId,
      _delta: data.delta,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const curatorTeamSetWeeklyMin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; min: number }) => ({
    playlistId: String(data?.playlistId ?? ""),
    min: Math.max(0, Math.min(1000000, Math.trunc(Number(data?.min) || 0))),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("curator_team_set_weekly_min", {
      _playlist_id: data.playlistId,
      _min: data.min,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type CuratorTeamPointEvent = {
  id: string;
  user_id: string;
  username: string | null;
  delta: number;
  reason: string | null;
  created_at: string;
};

export const curatorTeamPointHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: pl, error: plErr } = await supabase
      .from("curator_playlists")
      .select("id, curator_id")
      .eq("id", data.playlistId)
      .maybeSingle();
    if (plErr) throw new Error(plErr.message);
    if (!pl) throw new Error("Playlist not found");
    if (pl.curator_id !== userId) throw new Error("Only the curator can view point history");

    const { data: rows, error } = await supabase
      .from("curator_team_point_adjustments")
      .select("id, user_id, delta, reason, created_at")
      .eq("playlist_id", data.playlistId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    let names = new Map<string, string | null>();
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, username").in("id", ids);
      names = new Map((profs ?? []).map((p) => [p.id, p.username]));
    }
    return (rows ?? []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      username: names.get(r.user_id) ?? null,
      delta: r.delta,
      reason: r.reason,
      created_at: r.created_at,
    })) as CuratorTeamPointEvent[];
  });

export type CuratorTeamDailyStreams = {
  user_id: string;
  username: string | null;
  days: { date: string; count: number }[];
  total: number;
};

/** Per-member daily stream counts for the last 7 days on this playlist. */
export const curatorTeamDailyStreams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: pl, error: plErr } = await supabase
      .from("curator_playlists")
      .select("id, curator_id")
      .eq("id", data.playlistId)
      .maybeSingle();
    if (plErr) throw new Error(plErr.message);
    if (!pl) throw new Error("Playlist not found");

    const isCurator = pl.curator_id === userId;
    if (!isCurator) {
      const { data: membership } = await supabase
        .from("curator_team_members")
        .select("id")
        .eq("playlist_id", data.playlistId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!membership) throw new Error("Only room members can view stream counts");
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows: { user_id: string; played_at: string }[] = [];
    for (let from = 0; from < 100000; from += 1000) {
      const { data: page, error } = await supabaseAdmin
        .from("stream_points")
        .select("user_id, played_at")
        .eq("curator_playlist_id", data.playlistId)
        .gte("played_at", since)
        .order("id", { ascending: true })
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }

    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    let names = new Map<string, string | null>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, username")
        .in("id", ids);
      names = new Map((profs ?? []).map((p) => [p.id, p.username]));
    }

    const byUser = new Map<string, Map<string, number>>();
    (rows ?? []).forEach((r) => {
      const day = r.played_at.slice(0, 10);
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
      .sort((a, b) => b.total - a.total) as CuratorTeamDailyStreams[];
  });

/** Curator sets a team member's Facebook link + display name on their card. */
export const curatorTeamSetFacebook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; userId: string; url?: string; name?: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
    userId: String(data?.userId ?? ""),
    url: String(data?.url ?? "").trim().slice(0, 500),
    name: String(data?.name ?? "").trim().slice(0, 200),
  }))
  .handler(async ({ data, context }) => {
    // Saved once on the member's profile so it appears in every playlist tab/room.
    const { error } = await (context.supabase as any).rpc("set_member_facebook", {
      _user_id: data.userId,
      _fb_url: data.url,
      _fb_name: data.name,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const curatorTeamSetPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; days: number }) => ({
    playlistId: String(data?.playlistId ?? ""),
    days: Number(data?.days) === 30 ? 30 : Number(data?.days) === 1 ? 1 : 7,
  }))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("curator_team_set_min_period", {
      _playlist_id: data.playlistId,
      _days: data.days,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Chronological points ledger for a Spotify stream tracker member (OSG Artists or Team room). */
export const getSpotifyMemberPointTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { mode: "osg" | "team"; userId: string; playlistId?: string; curatorId?: string }) => ({
    mode: data?.mode === "team" ? ("team" as const) : ("osg" as const),
    userId: String(data?.userId ?? ""),
    playlistId: String(data?.playlistId ?? ""),
    curatorId: String(data?.curatorId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let curatorId = data.curatorId;
    let playlistIds: string[] = [];
    if (data.mode === "team") {
      const { data: pl } = await supabaseAdmin.from("curator_playlists").select("id, curator_id").eq("id", data.playlistId).maybeSingle();
      if (!pl) throw new Error("Playlist not found");
      curatorId = pl.curator_id;
      playlistIds = [pl.id];
    } else {
      const { data: pls } = await supabaseAdmin.from("curator_playlists").select("id").eq("curator_id", curatorId).eq("is_osg", true);
      playlistIds = (pls ?? []).map((p: any) => p.id);
    }
    if (curatorId !== context.userId && data.userId !== context.userId) {
      const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" } as any);
      if (!isAdmin) throw new Error("Only the curator or the member can view this timeline");
    }
    const plays: { played_at: string }[] = [];
    if (playlistIds.length) {
      for (let from = 0; ; from += 1000) {
        const { data: rows, error } = await supabaseAdmin.from("stream_points").select("played_at")
          .in("curator_playlist_id", playlistIds).eq("user_id", data.userId)
          .order("played_at", { ascending: true }).range(from, from + 999);
        if (error) throw new Error(error.message);
        plays.push(...(rows ?? []));
        if (!rows || rows.length < 1000) break;
      }
    }
    const { data: adjs } = data.mode === "team"
      ? await supabaseAdmin.from("curator_team_point_adjustments").select("created_at, delta, reason").eq("playlist_id", data.playlistId).eq("user_id", data.userId)
      : await supabaseAdmin.from("osg_point_adjustments").select("created_at, delta, reason").eq("curator_id", curatorId).eq("user_id", data.userId);
    type Ev = { at: string; kind: "stream" | "submission" | "adjustment"; points: number; label: string };
    const events: Ev[] = [];
    const byDay = new Map<string, { at: string; n: number }>();
    for (const p of plays) {
      const d = p.played_at.slice(0, 10);
      const e = byDay.get(d);
      if (e) e.n++; else byDay.set(d, { at: p.played_at, n: 1 });
    }
    for (const [, v] of byDay) events.push({ at: v.at, kind: "stream", points: v.n, label: `Streamed ${v.n} play${v.n === 1 ? "" : "s"}` });
    for (const a of (adjs ?? []) as any[]) events.push({ at: a.created_at, kind: "adjustment", points: a.delta, label: a.reason || (a.delta >= 0 ? "Curator added points" : "Curator removed points") });
    events.sort((a, b) => a.at.localeCompare(b.at));
    let bal = 0;
    const out = events.map((e) => ({ ...e, balance: (bal += e.points) }));
    return { events: out.reverse(), lifetimeBalance: bal };
  });

async function loadOwnedTeamPlaylist(supabaseAdmin: any, playlistId: string, userId: string) {
  const { data: pl } = await supabaseAdmin
    .from("curator_playlists")
    .select("id, curator_id, spotify_playlist_id, min_period_days, auto_remove_stars, is_team")
    .eq("id", playlistId)
    .maybeSingle();
  if (!pl || pl.curator_id !== userId) throw new Error("Only the curator can do that");
  return pl;
}

/** Curator picks how many red stars (1–7) take a member's tracks off the Spotify playlist, or Off. */
export const curatorTeamSetAutoRemoveStars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; stars: number | null }) => {
    const n = Math.trunc(Number(data?.stars) || 0);
    return { playlistId: String(data?.playlistId ?? ""), stars: n >= 1 && n <= 7 ? n : null };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadOwnedTeamPlaylist(supabaseAdmin, data.playlistId, context.userId);
    const { error } = await supabaseAdmin
      .from("curator_playlists")
      .update({ auto_remove_stars: data.stars })
      .eq("id", data.playlistId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Runs the star check: removes/restores members' tracks on the Spotify playlist. Returns removed user ids. */
export const curatorTeamSyncAutoRemovals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string }) => ({ playlistId: String(data?.playlistId ?? "") }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pl } = await supabaseAdmin
      .from("curator_playlists")
      .select("id, curator_id, spotify_playlist_id, min_period_days, auto_remove_stars")
      .eq("id", data.playlistId)
      .maybeSingle();
    if (!pl) throw new Error("Playlist not found");
    const isCurator = pl.curator_id === context.userId;
    if (!isCurator) {
      const { data: me } = await supabaseAdmin
        .from("curator_team_members")
        .select("id")
        .eq("playlist_id", pl.id)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!me) throw new Error("Not a member of this room");
    }
    const periodDays = Number(pl.min_period_days) || 7;
    try {
      const [{ data: members }, { data: adjs }] = await Promise.all([
        supabaseAdmin.from("curator_team_members").select("user_id, created_at").eq("playlist_id", pl.id),
        supabaseAdmin
          .from("curator_team_point_adjustments")
          .select("user_id, created_at")
          .eq("playlist_id", pl.id)
          .lt("delta", 0),
      ]);
      const last = new Map<string, string>();
      for (const a of adjs ?? []) {
        const p = last.get(a.user_id);
        if (!p || a.created_at > p) last.set(a.user_id, a.created_at);
      }
      const { syncAutoRemovals } = await import("./beta-auto-remove.server");
      const { parseSpotifyTrackId } = await import("./beta-spotify.server");
      let tokenPromise: Promise<string | null> | null = null;
      const getToken = () =>
        (tokenPromise ??= import("./curator-submissions.functions").then(async (m) => {
          const r: any = await m.getCuratorAccessToken(pl.curator_id, supabaseAdmin);
          return (r?.accessToken as string) ?? null;
        }));
      const { data: existing } = await supabaseAdmin
        .from("curator_team_auto_removals")
        .select("user_id")
        .eq("playlist_id", pl.id)
        .limit(1);
      // Only touch Spotify when the feature is on, or tracks still need restoring.
      if (pl.auto_remove_stars || existing?.length) {
        await syncAutoRemovals(supabaseAdmin, {
          playlistId: pl.id,
          spotifyPlaylistId: pl.spotify_playlist_id,
          ownerId: pl.curator_id,
          threshold: pl.auto_remove_stars ?? null,
          periodDays,
          members: (members ?? []).map((m: any) => ({
            user_id: m.user_id,
            joined_at: m.created_at ?? null,
            last_deduction_at: last.get(m.user_id) ?? null,
          })),
          removalsTable: "curator_team_auto_removals",
          accessToken: await getToken(),
          trackIdsByUser: async (uids) => {
            const { data: links } = await supabaseAdmin
              .from("curator_team_member_links")
              .select("user_id, track_urls")
              .eq("playlist_id", pl.id)
              .in("user_id", uids);
            const out = new Map<string, string[]>();
            for (const l of links ?? []) {
              const ids = ((l.track_urls as string[] | null) ?? [])
                .map((u) => parseSpotifyTrackId(u))
                .filter(Boolean) as string[];
              out.set(l.user_id, ids);
            }
            return out;
          },
        });
      }
    } catch (e) {
      console.error("Team auto-remove sync failed", e);
    }
    const { data: rows } = await supabaseAdmin
      .from("curator_team_auto_removals")
      .select("user_id")
      .eq("playlist_id", pl.id);
    return {
      autoRemoveStars: (pl.auto_remove_stars as number | null) ?? null,
      removedUserIds: Array.from(new Set((rows ?? []).map((r: any) => r.user_id as string))),
    };
  });

/** Curator removes every member's points in one go; returns a batch id that Undo can reverse. */
export const curatorTeamRemoveAllPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string }) => ({ playlistId: String(data?.playlistId ?? "") }))
  .handler(async ({ data, context }) => {
    const { data: roster, error } = await context.supabase.rpc("curator_team_roster", {
      _playlist_id: data.playlistId,
    });
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadOwnedTeamPlaylist(supabaseAdmin, data.playlistId, context.userId);
    const batchId = crypto.randomUUID();
    const rows = (roster ?? [])
      .filter((r: any) => Number(r.points) > 0)
      .map((r: any) => ({
        playlist_id: data.playlistId,
        user_id: r.user_id,
        curator_id: context.userId,
        delta: -Number(r.points),
        reason: "Curator removed all points",
        batch_id: batchId,
      }));
    if (!rows.length) throw new Error("No members have points to remove");
    const { error: insErr } = await supabaseAdmin.from("curator_team_point_adjustments").insert(rows);
    if (insErr) throw new Error(insErr.message);
    return { batchId, members: rows.length, points: rows.reduce((s: number, r: any) => s - r.delta, 0) };
  });

/** Puts back exactly the points a "Remove all points" action took away. */
export const curatorTeamUndoRemoveAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string; batchId: string }) => ({
    playlistId: String(data?.playlistId ?? ""),
    batchId: String(data?.batchId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    if (!data.batchId) throw new Error("Nothing to undo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadOwnedTeamPlaylist(supabaseAdmin, data.playlistId, context.userId);
    const { data: del, error } = await supabaseAdmin
      .from("curator_team_point_adjustments")
      .delete()
      .eq("playlist_id", data.playlistId)
      .eq("batch_id", data.batchId)
      .select("id");
    if (error) throw new Error(error.message);
    return { restored: del?.length ?? 0 };
  });

/** Latest "Remove all points" batch still on record, so Undo survives a page reload. */
export const curatorTeamLastRemoveAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { playlistId: string }) => ({ playlistId: String(data?.playlistId ?? "") }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await loadOwnedTeamPlaylist(supabaseAdmin, data.playlistId, context.userId);
    const { data: row } = await supabaseAdmin
      .from("curator_team_point_adjustments")
      .select("batch_id, created_at")
      .eq("playlist_id", data.playlistId)
      .not("batch_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return row ? { batchId: row.batch_id as string, at: row.created_at as string } : null;
  });
