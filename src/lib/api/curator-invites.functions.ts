import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const inviteCuratorUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { username: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("invite_curator_user", {
      _username: data.username,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const respondCuratorInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { inviteId: string; accept: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("respond_curator_invite", {
      _invite_id: data.inviteId,
      _accept: data.accept,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelCuratorInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { inviteId: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("cancel_curator_invite", {
      _invite_id: data.inviteId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyCuratorInvitees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("list_my_curator_invitees");
    return (data ?? []) as Array<{
      id: string;
      user_id: string;
      username: string;
      avatar_url: string | null;
      status: "pending" | "accepted" | "declined";
      created_at: string;
    }>;
  });

export const listCuratorInvitesForMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("list_curator_invites_for_me");
    return (data ?? []) as Array<{
      id: string;
      curator_id: string;
      curator_username: string;
      curator_avatar: string | null;
      status: "pending" | "accepted" | "declined";
      created_at: string;
    }>;
  });
