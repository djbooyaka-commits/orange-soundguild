import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const BUCKETS = ["audio", "covers", "avatars"] as const;
// Longer TTL keeps URLs stable so the browser/CDN can cache the media
// instead of re-downloading it on every navigation.
const SIGNED_TTL = 60 * 60 * 6; // 6 hours

const inputSchema = z.object({
  items: z
    .array(
      z.object({
        bucket: z.enum(BUCKETS),
        path: z.string().min(1).max(500),
      }),
    )
    .min(1)
    .max(100),
});

export const signMediaUrls = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Collect distinct paths per bucket and verify they belong to a publicly
    // visible row before signing. This lets anonymous browsing work while
    // preventing arbitrary storage-path signing.
    const audioPaths = new Set<string>();
    const coverPaths = new Set<string>();
    const avatarPaths = new Set<string>();
    for (const { bucket, path } of data.items) {
      if (path.startsWith("http")) continue;
      if (bucket === "audio") audioPaths.add(path);
      else if (bucket === "covers") coverPaths.add(path);
      else if (bucket === "avatars") avatarPaths.add(path);
    }

    const allowed = { audio: new Set<string>(), covers: new Set<string>(), avatars: new Set<string>() };

    if (audioPaths.size > 0) {
      const { data: rows } = await supabaseAdmin
        .from("tracks")
        .select("audio_url")
        .in("audio_url", Array.from(audioPaths));
      rows?.forEach((r) => r.audio_url && allowed.audio.add(r.audio_url));
    }
    if (coverPaths.size > 0) {
      const { data: rows } = await supabaseAdmin
        .from("tracks")
        .select("cover_art_url")
        .in("cover_art_url", Array.from(coverPaths));
      rows?.forEach((r) => r.cover_art_url && allowed.covers.add(r.cover_art_url));
    }
    if (avatarPaths.size > 0) {
      const { data: rows } = await supabaseAdmin
        .from("profiles")
        .select("avatar_url")
        .in("avatar_url", Array.from(avatarPaths));
      rows?.forEach((r) => r.avatar_url && allowed.avatars.add(r.avatar_url));
    }

    const results = await Promise.all(
      data.items.map(async ({ bucket, path }) => {
        if (path.startsWith("http")) return { bucket, path, url: path };
        if (!allowed[bucket].has(path)) return { bucket, path, url: null };
        const { data: signed } = await supabaseAdmin.storage
          .from(bucket)
          .createSignedUrl(path, SIGNED_TTL);
        return { bucket, path, url: signed?.signedUrl ?? null };
      }),
    );
    return { results };
  });
