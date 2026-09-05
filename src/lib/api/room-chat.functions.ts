import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Chat rooms for stream tracker members only.
 * scope "beta"    -> room_key is a beta_rooms.id (Last.fm stream rooms)
 * scope "curator" -> room_key is the curator's user id (Spotify stream tracker)
 */

export type ChatScope = "beta" | "curator";

export type RoomChatMessage = {
  id: string;
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  body: string;
  created_at: string;
  is_me: boolean;
};

function parseInput(data: { scope: string; roomKey: string; body?: string; sinceId?: string }) {
  const scope = data?.scope === "curator" ? "curator" : "beta";
  return {
    scope: scope as ChatScope,
    roomKey: String(data?.roomKey ?? ""),
    body: typeof data?.body === "string" ? data.body : "",
  };
}

async function assertMember(
  supabaseAdmin: any,
  scope: ChatScope,
  roomKey: string,
  userId: string,
): Promise<void> {
  if (!roomKey) throw new Error("Room not found");

  if (scope === "beta") {
    const { data: room } = await supabaseAdmin
      .from("beta_rooms")
      .select("id, owner_id")
      .eq("id", roomKey)
      .maybeSingle();
    if (!room) throw new Error("Room not found");
    if (room.owner_id === userId) return;
    const { data: member } = await supabaseAdmin
      .from("beta_room_members")
      .select("id")
      .eq("room_id", roomKey)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) throw new Error("Join this room first");
    return;
  }

  // curator room: the curator themself, or an accepted invitee
  if (roomKey === userId) return;
  const { data: invite } = await supabaseAdmin
    .from("curator_invites")
    .select("id")
    .eq("curator_id", roomKey)
    .eq("user_id", userId)
    .eq("status", "accepted")
    .maybeSingle();
  if (!invite) throw new Error("Join this room first");
}

export const listRoomChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseInput)
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertMember(supabaseAdmin, data.scope, data.roomKey, context.userId);

    const { data: rows } = await supabaseAdmin
      .from("room_chat_messages")
      .select("id, user_id, body, created_at")
      .eq("scope", data.scope)
      .eq("room_key", data.roomKey)
      .order("created_at", { ascending: false })
      .limit(100);

    const list = (rows ?? []).slice().reverse();
    const ids = Array.from(new Set(list.map((m: any) => m.user_id)));
    const profiles = ids.length
      ? (
          await supabaseAdmin
            .from("profiles")
            .select("id, username, avatar_url")
            .in("id", ids)
        ).data ?? []
      : [];
    const byId = new Map(profiles.map((p: any) => [p.id, p]));

    return list.map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      username: byId.get(m.user_id)?.username ?? null,
      avatar_url: byId.get(m.user_id)?.avatar_url ?? null,
      body: m.body,
      created_at: m.created_at,
      is_me: m.user_id === context.userId,
    })) as RoomChatMessage[];
  });

export const postRoomChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseInput)
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertMember(supabaseAdmin, data.scope, data.roomKey, context.userId);

    const body = data.body.trim().slice(0, 1000);
    if (!body) throw new Error("Message is empty");

    const { error } = await supabaseAdmin.from("room_chat_messages").insert({
      scope: data.scope,
      room_key: data.roomKey,
      user_id: context.userId,
      body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRoomChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { messageId: string }) => ({ messageId: String(data?.messageId ?? "") }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: msg } = await supabaseAdmin
      .from("room_chat_messages")
      .select("id, user_id, scope, room_key")
      .eq("id", data.messageId)
      .maybeSingle();
    if (!msg) return { ok: true };

    let allowed = msg.user_id === context.userId;
    if (!allowed) {
      if (msg.scope === "curator") {
        allowed = msg.room_key === context.userId;
      } else {
        const { data: room } = await supabaseAdmin
          .from("beta_rooms")
          .select("owner_id")
          .eq("id", msg.room_key)
          .maybeSingle();
        allowed = room?.owner_id === context.userId;
      }
    }
    if (!allowed) throw new Error("Not allowed");

    await supabaseAdmin.from("room_chat_messages").delete().eq("id", data.messageId);
    return { ok: true };
  });
