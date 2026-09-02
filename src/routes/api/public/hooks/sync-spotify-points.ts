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
          .select("user_id")
          .limit(1000);
        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }

        let usersSynced = 0;
        let pointsAdded = 0;
        let failed = 0;
        for (const connection of connections ?? []) {
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