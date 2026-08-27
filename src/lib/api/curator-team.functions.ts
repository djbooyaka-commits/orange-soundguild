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
    const { data: rows, error } = await context.supabase.rpc("curator_team_roster", {
      _playlist_id: data.playlistId,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as CuratorTeamMember[];
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
      _artist_url: data.artistUrl || null,
      _artist_name: null,
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
      _reason: data.reason || null,
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
