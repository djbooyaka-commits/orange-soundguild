import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { curatorRoomAccess as roomAccess, type CuratorRoomScope } from "./curator-room-access";

export type { CuratorRoomScope };

type Input = { scope: CuratorRoomScope; roomKey: string };

const parseInput = (data: Input): Input => ({
  scope: data?.scope === "osg" ? "osg" : "team",
  roomKey: String(data?.roomKey ?? ""),
});

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
