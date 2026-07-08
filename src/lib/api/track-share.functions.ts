import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({ trackId: z.string().uuid() });

export const getTrackShareMeta = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("tracks")
      .select("id, title, genre, cover_art_url, user_id, profiles(username)")
      .eq("id", data.trackId)
      .maybeSingle();
    if (!row) return { title: null, artist: null, genre: null, coverUrl: null };

    let coverUrl: string | null = null;
    if (row.cover_art_url) {
      if (row.cover_art_url.startsWith("http")) {
        coverUrl = row.cover_art_url;
      } else {
        const { data: signed } = await supabaseAdmin.storage
          .from("covers")
          .createSignedUrl(row.cover_art_url, 60 * 60 * 24 * 7);
        coverUrl = signed?.signedUrl ?? null;
      }
    }

    const profiles = row.profiles as { username: string | null } | null;
    return {
      title: row.title as string,
      artist: profiles?.username ?? null,
      genre: (row.genre as string) ?? null,
      coverUrl,
    };
  });
