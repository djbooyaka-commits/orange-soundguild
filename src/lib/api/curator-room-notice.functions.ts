import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CuratorRoomScope = "team" | "osg";

type Input = { scope: CuratorRoomScope; roomKey: string };

const parseInput = (data: Input): Input => ({
  scope: data?.scope === "osg" ? "osg" : "team",
  roomKey: String(data?.roomKey ?? ""),
});

/** Returns the room's curator id and whether the caller is that curator or a member. */
async function roomAccess(admin: any, { scope, roomKey }: Input, userId: string) {
  if (scope === "osg") {
    // OSG Artists room: room key is the curator's user id; members are their picks.
    const curatorId = roomKey;
    if (curatorId === userId) return { curatorId, isOwner: true, isMember: true };
    const { data } = await admin
      .from("osg_artist_picks")
      .select("id")
      .eq("user_id", curatorId)
      .eq("artist_id", userId)
      .limit(1);
    return { curatorId, isOwner: false, isMember: (data ?? []).length > 0 };
  }
  const { data: pl } = await admin
    .from("curator_playlists")
    .select("curator_id")
    .eq("id", roomKey)
    .maybeSingle();
  if (!pl) throw new Error("Room not found");
  const curatorId = pl.curator_id as string;
  if (curatorId === userId) return { curatorId, isOwner: true, isMember: true };
  const { data } = await admin
    .from("curator_team_members")
    .select("id")
    .eq("playlist_id", roomKey)
    .eq("user_id", userId)
    .limit(1);
  return { curatorId, isOwner: false, isMember: (data ?? []).length > 0 };
}

export const getCuratorRoomNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseInput)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const access = await roomAccess(supabaseAdmin, data, context.userId);
    if (!access.isMember) return { notice: null as string | null, isOwner: false };
    const { data: row } = await (supabaseAdmin as any)
      .from("curator_room_notices")
      .select("notice")
      .eq("scope", data.scope)
      .eq("room_key", data.roomKey)
      .maybeSingle();
    return { notice: ((row?.notice as string | undefined) ?? null) as string | null, isOwner: access.isOwner };
  });

export const setCuratorRoomNotice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Input & { notice: string }) => ({
    ...parseInput(data),
    notice: String(data?.notice ?? "").trim().slice(0, 2000),
  }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const access = await roomAccess(supabaseAdmin, data, context.userId);
    if (!access.isOwner) throw new Error("Only the room's curator can do that");
    const table = (supabaseAdmin as any).from("curator_room_notices");
    if (!data.notice) {
      const { error } = await table.delete().eq("scope", data.scope).eq("room_key", data.roomKey);
      if (error) throw new Error(error.message);
      return { notice: null as string | null };
    }
    const { error } = await table.upsert(
      {
        scope: data.scope,
        room_key: data.roomKey,
        curator_id: access.curatorId,
        notice: data.notice,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "scope,room_key" },
    );
    if (error) throw new Error(error.message);
    return { notice: data.notice as string | null };
  });
