import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PublicTrackDTO = { id: string; title: string; artist: string; genre: string; plays: number };

export const getPublicTracks = createServerFn({ method: "GET" })
  .inputValidator((d: { order: "latest" | "top" }) => ({ order: d.order === "top" ? "top" : "latest" }) as const)
  .handler(async ({ data }): Promise<PublicTrackDTO[]> => {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return [];
    try {
      const sb = createClient<Database>(url, key, {
        auth: { persistSession: false },
        global: {
          fetch: (input, init) => {
            const h = new Headers(init?.headers);
            if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
            h.set("apikey", key);
            return fetch(input, { ...init, headers: h });
          },
        },
      });
      let q = sb.from("tracks").select("id, title, genre, plays_count, profiles(username)");
      q = data.order === "top"
        ? q.order("plays_count", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false })
        : q.order("created_at", { ascending: false });
      const { data: rows } = await q.limit(data.order === "top" ? 100 : 60);
      return (rows ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        genre: r.genre,
        plays: r.plays_count ?? 0,
        artist: (r.profiles as { username: string | null } | null)?.username ?? "Artist",
      }));
    } catch {
      return [];
    }
  });
