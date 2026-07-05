import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKETS = ["audio", "covers", "avatars"] as const;
const SIGNED_TTL = 60 * 60; // 1 hour

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
    const results = await Promise.all(
      data.items.map(async ({ bucket, path }) => {
        if (path.startsWith("http")) return { bucket, path, url: path };
        const { data: signed } = await supabaseAdmin.storage
          .from(bucket)
          .createSignedUrl(path, SIGNED_TTL);
        return { bucket, path, url: signed?.signedUrl ?? null };
      }),
    );
    return { results };
  });
