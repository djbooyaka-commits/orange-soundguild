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

    const { data: collaboratorRows } = await supabaseAdmin
      .from("track_collaborators")
      .select("user_id, position")
      .eq("track_id", row.id)
      .order("position", { ascending: true });
    const collaboratorIds = ((collaboratorRows ?? []) as Array<{ user_id: string }>).map((c) => c.user_id);
    const { data: collaboratorProfiles } = collaboratorIds.length
      ? await supabaseAdmin.from("profiles").select("id, username").in("id", collaboratorIds)
      : { data: [] };
    const nameById = new Map(
      ((collaboratorProfiles ?? []) as Array<{ id: string; username: string | null }>).map((p) => [p.id, p.username]),
    );

    const profiles = row.profiles as { username: string | null } | null;
    const artistNames = [
      profiles?.username,
      ...collaboratorIds.map((id) => nameById.get(id)),
    ]
      .map((name) => name?.trim() ?? "")
      .filter(Boolean)
      .filter((name, index, list) => list.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === index);
    return {
      title: row.title as string,
      artist: artistNames.join(" & ") || null,
      genre: (row.genre as string) ?? null,
      coverUrl,
    };
  });
