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

        if (parsed.data.action === "mark_added") {
          const ids = parsed.data.ids ?? [];
          if (!ids.length) return json({ updated: 0 });
          const { data, error } = await supabaseAdmin
            .from("curator_submissions")
            .update({ added_to_spotify: true, spotify_error: null })
            .eq("curator_id", curatorId)
            .eq("status", "approved")
            .in("id", ids)
            .select("id");
          if (error) return json({ error: "Could not update" }, 500);
          return json({ updated: data?.length ?? 0 });
        }

        const { data: subs, error } = await supabaseAdmin
          .from("curator_submissions")
          .select("id, spotify_track_id, spotify_track_name, curator_playlist_id, reviewed_at, created_at")
          .eq("curator_id", curatorId)
          .eq("status", "approved")
          .eq("added_to_spotify", false)
          .order("created_at", { ascending: true })
          .limit(500);
        if (error) return json({ error: "Could not load queue" }, 500);
        const { data: pls } = await supabaseAdmin
          .from("curator_playlists")
          .select("id, name, spotify_playlist_id")
          .eq("curator_id", curatorId);
        const playlists = (pls ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          spotify_playlist_id: p.spotify_playlist_id,
          tracks: (subs ?? [])
            .filter((s) => s.curator_playlist_id === p.id)
            .map((s) => ({ id: s.id, uri: `spotify:track:${s.spotify_track_id}`, name: s.spotify_track_name ?? s.spotify_track_id })),
        }));
        return json({ playlists });
      },
    },
  },
});
