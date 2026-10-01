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
    days: Number(data?.days) === 30 ? 30 : 7,
  }))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("curator_team_set_min_period", {
      _playlist_id: data.playlistId,
      _days: data.days,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
