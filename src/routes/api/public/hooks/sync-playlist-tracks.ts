import { createFileRoute } from "@tanstack/react-router";

// Re-imports the Spotify track list for every beta room playlist, and removes songs past their
// hold days on submission playlists where the curator turned that on.
// Called by a scheduled job once a day at 03:00 UTC.
export const Route = createFileRoute("/api/public/hooks/sync-playlist-tracks")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { importPlaylistTracks } = await import("@/lib/api/beta-curator.functions");

        const { data: playlists, error } = await supabaseAdmin
          .from("beta_room_playlists")
          .select("id, room_id, spotify_playlist_id, track_hold_days, is_team, platform, auto_remove_expired")
          .limit(500);
        const { cleanupBetaPlaylist, cleanupCuratorPlaylist, CURATOR_EXPIRY_COLUMNS } = await import(
          "@/lib/api/expired-tracks.server"
        );
        let expiredRemoved = 0;

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const owners = new Map<string, string>();
        let synced = 0;
        let failed = 0;

        for (const pl of playlists ?? []) {
          try {
            let ownerId = owners.get(pl.room_id as string);
            if (!ownerId) {
              const { data: room } = await supabaseAdmin
                .from("beta_rooms")
                .select("owner_id")
                .eq("id", pl.room_id)
                .maybeSingle();
              if (!room?.owner_id) continue;
              ownerId = room.owner_id as string;
              owners.set(pl.room_id as string, ownerId);
            }
            if ((pl as any).auto_remove_expired) {
              try {
                expiredRemoved += (await cleanupBetaPlaylist(supabaseAdmin, pl as any, ownerId)).removed;
              } catch (e) {
                console.error("Expired-track cleanup failed for playlist", pl.id, e);
              }
            }
            await importPlaylistTracks(
              supabaseAdmin,
              pl.room_id as string,
              pl.id as string,
              pl.spotify_playlist_id as string,
              ownerId,
            );
            synced++;
          } catch (e) {
            failed++;
            console.error("Auto-sync failed for playlist", pl.id, e);
          }
        }

        // Curator (Spotify stream tracker) submission playlists with old-song cleanup turned on.
        const { data: curatorRows } = await supabaseAdmin
          .from("curator_playlists")
          .select(CURATOR_EXPIRY_COLUMNS)
          .eq("auto_remove_expired", true)
          .limit(500);
        for (const row of (curatorRows ?? []) as any[]) {
          try {
            expiredRemoved += (await cleanupCuratorPlaylist(supabaseAdmin, row)).removed;
          } catch (e) {
            console.error("Expired-track cleanup failed for curator playlist", row.id, e);
          }
        }

        return new Response(JSON.stringify({ ok: true, synced, failed, expiredRemoved }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
