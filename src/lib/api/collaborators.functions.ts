import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listTrackCollaborators = createServerFn({ method: "GET" })
  .inputValidator((input: { trackId: string }) => input)
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const supabase = createClient(process.env.SUPABASE_URL!, key, {
      auth: { persistSession: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: rows } = await supabase
      .from("track_collaborators")
      .select("user_id, position")
      .eq("track_id", data.trackId)
      .order("position", { ascending: true });
    const ids = (rows ?? []).map((r) => r.user_id);
    if (!ids.length) return { collaborators: [] as { id: string; username: string; avatar_url: string | null }[] };
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", ids);
    const map = new Map((profs ?? []).map((p) => [p.id, p]));
    return {
      collaborators: ids
        .map((id) => {
          const p = map.get(id);
          return p ? { id: p.id, username: p.username ?? "", avatar_url: p.avatar_url } : null;
        })
        .filter((x): x is { id: string; username: string; avatar_url: string | null } => !!x),
    };
  });

export const searchUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { q: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase.rpc("search_profiles_by_username", { _q: data.q });
    return { results: (rows ?? []) as { id: string; username: string; avatar_url: string | null }[] };
  });

export const addTrackCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { trackId: string; userId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: track } = await context.supabase
      .from("tracks")
      .select("user_id")
      .eq("id", data.trackId)
      .maybeSingle();
    if (!track || track.user_id !== context.userId) throw new Error("Not your track");
    if (data.userId === context.userId) throw new Error("You're already listed as the uploader");
    const { data: existing } = await context.supabase
      .from("track_collaborators")
      .select("position")
      .eq("track_id", data.trackId)
      .order("position", { ascending: false })
      .limit(1);
    const nextPos = (existing?.[0]?.position ?? -1) + 1;
    const { error } = await context.supabase
      .from("track_collaborators")
      .insert({ track_id: data.trackId, user_id: data.userId, position: nextPos });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeTrackCollaborator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { trackId: string; userId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: track } = await context.supabase
      .from("tracks")
      .select("user_id")
      .eq("id", data.trackId)
      .maybeSingle();
    if (!track || track.user_id !== context.userId) throw new Error("Not your track");
    const { error } = await context.supabase
      .from("track_collaborators")
      .delete()
      .eq("track_id", data.trackId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
