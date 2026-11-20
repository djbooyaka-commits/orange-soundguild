import { createFileRoute } from "@tanstack/react-router";

// Hourly: checks Spotify only for members whose auto-update is on (they synced
// or streamed a Curator playlist in the last 10 hours), so plays are saved
// before Spotify's 50-play history drops them, day or night, with the screen off.
export const Route = createFileRoute("/api/public/hooks/sync-active-spotify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { pollSpotifyRecentForUser } = await import("@/lib/api/spotify.functions");
        const now = new Date();
        // Skip anyone already checked in the last 40 minutes (page view / Sync now).
        const recent = new Date(now.getTime() - 40 * 60 * 1000).toISOString();
        const { data: rows } = await (supabaseAdmin as any)
          .from("spotify_connections")
          .select("user_id, last_view_sync_at")
          .gt("auto_sync_until", now.toISOString())
          .or(`last_view_sync_at.is.null,last_view_sync_at.lt.${recent}`)
          .limit(100);
        let checked = 0;
        let added = 0;
        for (const r of (rows ?? []) as { user_id: string }[]) {
          try {
            await (supabaseAdmin as any)
              .from("spotify_connections")
              .update({ last_view_sync_at: now.toISOString() })
              .eq("user_id", r.user_id);
            const res: any = await pollSpotifyRecentForUser(r.user_id, supabaseAdmin);
            checked++;
            added += res?.added ?? 0;
          } catch (e) {
            console.error("Active Spotify sync failed", r.user_id, e);
          }
        }
        return new Response(JSON.stringify({ ok: true, checked, added }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
