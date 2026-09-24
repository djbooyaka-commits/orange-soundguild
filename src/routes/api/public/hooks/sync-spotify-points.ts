import { createHash, timingSafeEqual } from "crypto";
import { createFileRoute } from "@tanstack/react-router";

function tokensMatch(provided: string, expected: string): boolean {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export const Route = createFileRoute("/api/public/hooks/sync-spotify-points")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { pollSpotifyRecentForUser } = await import("@/lib/api/spotify.functions");
        const providedToken = request.headers.get("x-cron-secret") ?? "";

        const { data: secretRow } = await (supabaseAdmin as any)
          .from("scheduled_job_secrets")
          .select("secret")
          .eq("name", "spotify-points-hourly")
          .maybeSingle();

        if (!secretRow?.secret || !providedToken || !tokensMatch(providedToken, secretRow.secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { data: connections, error } = await supabaseAdmin
          .from("spotify_connections")
          .select("user_id, last_polled_at")
          .limit(1000);
        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }

        // Spotify only returns the last 50 plays, so anyone who streamed in the
        // last 2 days must be polled every hour or plays beyond 50 are lost.
        // Truly idle listeners are polled every 3 hours.
        const { data: openSessions } = await (supabaseAdmin as any)
          .from("beta_playlist_tracking_sessions")
          .select("user_id")
          .is("stopped_at", null)
          .limit(2000);
        const activeUserIds = new Set<string>(
          ((openSessions ?? []) as Array<{ user_id: string }>).map((s) => s.user_id),
        );
        const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: recentStreamers } = await (supabaseAdmin as any)
          .from("stream_points")
          .select("user_id")
          .gte("played_at", since)
          .limit(20000);
        for (const r of (recentStreamers ?? []) as Array<{ user_id: string }>) {
          activeUserIds.add(r.user_id);
        }
        const IDLE_INTERVAL_MS = 3 * 60 * 60 * 1000;
        const due = (connections ?? []).filter((c: any) => {
          if (activeUserIds.has(c.user_id)) return true;
          if (!c.last_polled_at) return true;
          return Date.now() - new Date(c.last_polled_at).getTime() >= IDLE_INTERVAL_MS;
        });

        let usersSynced = 0;
        let pointsAdded = 0;
        let failed = 0;
        for (const connection of due) {
          try {
            const result = await pollSpotifyRecentForUser(connection.user_id, supabaseAdmin);
            if (result.connected) usersSynced += 1;
            pointsAdded += result.added ?? 0;
            if (result.error) failed += 1;
          } catch (error) {
            failed += 1;
            console.error("Scheduled Spotify point sync failed", connection.user_id, error);
          }
        }

        return Response.json({ ok: true, usersSynced, pointsAdded, failed });
      },
    },
  },
});