import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
      created_at: string;
    }>;
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
