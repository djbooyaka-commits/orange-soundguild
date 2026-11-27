import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Used by the OSG Spotify Helper Windows app. Every call carries a signed curator key;
// it only returns and updates that curator's own approved-but-not-added submissions.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const Body = z.object({
  key: z.string().min(20).max(400),
  action: z.enum(["queue", "mark_added"]),
  ids: z.array(z.string().uuid()).max(500).optional(),
});

export const Route = createFileRoute("/api/public/curator-desktop")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Bad request" }, 400);
        const { verifyDesktopKey } = await import("@/lib/api/curator-desktop.server");
        const curatorId = verifyDesktopKey(parsed.data.key);
        if (!curatorId) return json({ error: "Key is invalid or expired. Make a new one on your Curator page." }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { loadDesktopQueue, markDesktopTracksAdded } = await import("@/lib/api/curator-desktop-queue.server");
        try {
          return json(parsed.data.action === "mark_added"
            ? await markDesktopTracksAdded(supabaseAdmin, curatorId, parsed.data.ids ?? [])
            : await loadDesktopQueue(supabaseAdmin, curatorId));
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Could not load queue" }, 500);
        }
      },
    },
  },
});
