import { createFileRoute } from "@tanstack/react-router";

// Re-imports the Spotify track list for every beta room playlist.
// Called by a scheduled job every 12 hours.
export const Route = createFileRoute("/api/public/hooks/sync-playlist-tracks")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { importPlaylistTracks } = await import("@/lib/api/beta-curator.functions");

        const { data: playlists, error } = await supabaseAdmin
          .from("beta_room_playlists")
          .select("id, room_id, spotify_playlist_id")
          .limit(500);

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

        return new Response(JSON.stringify({ ok: true, synced, failed }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
