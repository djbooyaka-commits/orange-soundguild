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
  image_url: string | null;
  created_at: string;
  edited_at: string | null;
  is_me: boolean;
  reply_to: string | null;
  reply_username: string | null;
  reply_body: string | null;
};

function parseInput(data: {
  scope: string;
  roomKey: string;
  body?: string;
  imageUrl?: string | null;
  sinceId?: string;
  replyTo?: string | null;
}) {
  const scope = data?.scope === "curator" ? "curator" : "beta";
  return {
    scope: scope as ChatScope,
    roomKey: String(data?.roomKey ?? ""),
    body: typeof data?.body === "string" ? data.body : "",
    imageUrl: typeof data?.imageUrl === "string" && data.imageUrl ? data.imageUrl.slice(0, 500) : null,
    replyTo: typeof data?.replyTo === "string" && data.replyTo ? data.replyTo : null,
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
      .select("id, user_id, body, image_url, created_at, edited_at, reply_to")
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

    // Sign attachments (members of the room are already verified above)
    const mediaPaths = Array.from(
      new Set(list.map((m: any) => m.image_url).filter((p: any) => typeof p === "string" && p)),
    ) as string[];
    const signedByPath = new Map<string, string>();
    await Promise.all(
      mediaPaths.map(async (path) => {
        const { data: signed } = await supabaseAdmin.storage
          .from("chat-images")
          .createSignedUrl(path, 60 * 60 * 24);
        if (signed?.signedUrl) signedByPath.set(path, signed.signedUrl);
      }),
    );

    const byMessageId = new Map(list.map((m: any) => [m.id, m]));
    const missingParents = Array.from(
      new Set(list.map((m: any) => m.reply_to).filter((id: any) => id && !byMessageId.has(id))),
    ) as string[];
    if (missingParents.length) {
      const { data: parents } = await supabaseAdmin
        .from("room_chat_messages")
        .select("id, user_id, body, image_url")
        .in("id", missingParents);
      for (const p of parents ?? []) byMessageId.set(p.id, p);
      const parentIds = Array.from(new Set((parents ?? []).map((p: any) => p.user_id)));
      const extra = parentIds.length
        ? (await supabaseAdmin.from("profiles").select("id, username, avatar_url").in("id", parentIds)).data ?? []
        : [];
      for (const p of extra) if (!byId.has(p.id)) byId.set(p.id, p);
    }

    return list.map((m: any) => {
      const parent = m.reply_to ? byMessageId.get(m.reply_to) : null;
      return {
      id: m.id,
      user_id: m.user_id,
      username: byId.get(m.user_id)?.username ?? null,
      avatar_url: byId.get(m.user_id)?.avatar_url ?? null,
      body: m.body,
      image_url: m.image_url ? signedByPath.get(m.image_url) ?? null : null,
      created_at: m.created_at,
      edited_at: m.edited_at ?? null,
      is_me: m.user_id === context.userId,
      reply_to: m.reply_to ?? null,
      reply_username: parent ? byId.get(parent.user_id)?.username ?? null : null,
      reply_body: parent ? (parent.body || (parent.image_url ? "Photo" : "")) : null,
      };
    }) as RoomChatMessage[];
  });

export const postRoomChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseInput)
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertMember(supabaseAdmin, data.scope, data.roomKey, context.userId);

    const body = data.body.trim().slice(0, 1000);
    if (!body && !data.imageUrl) throw new Error("Message is empty");
    if (data.imageUrl && !data.imageUrl.startsWith(`${context.userId}/`)) {
      throw new Error("Invalid attachment");
    }

    const { error } = await supabaseAdmin.from("room_chat_messages").insert({
      scope: data.scope,
      room_key: data.roomKey,
      user_id: context.userId,
      body,
      image_url: data.imageUrl,
      reply_to: data.replyTo,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const editRoomChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { messageId: string; body: string }) => ({
    messageId: String(data?.messageId ?? ""),
    body: String(data?.body ?? ""),
  }))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const body = data.body.trim().slice(0, 1000);
    if (!body) throw new Error("Message is empty");

    const { data: msg } = await supabaseAdmin
      .from("room_chat_messages")
      .select("id, user_id")
      .eq("id", data.messageId)
      .maybeSingle();
    if (!msg) throw new Error("Message not found");
    if (msg.user_id !== context.userId) throw new Error("Not allowed");

    const { error } = await supabaseAdmin
      .from("room_chat_messages")
      .update({ body, edited_at: new Date().toISOString() })
      .eq("id", data.messageId);
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

export const latestRoomChatAt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseInput)
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      await assertMember(supabaseAdmin, data.scope, data.roomKey, context.userId);
    } catch {
      return { created_at: null as string | null };
    }
    const { data: row } = await supabaseAdmin
      .from("room_chat_messages")
      .select("created_at")
      .eq("scope", data.scope)
      .eq("room_key", data.roomKey)
      .neq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { created_at: (row?.created_at as string | undefined) ?? null };
  });
