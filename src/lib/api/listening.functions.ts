import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type TopTrack = {
  track_id: string;
  title: string;
  cover_art_url: string | null;
  artist_id: string;
  artist_username: string | null;
  plays: number;
};

export type TopArtist = {
  artist_id: string;
  username: string | null;
  avatar_url: string | null;
  plays: number;
};

export const getMyListeningStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: plays } = await supabase
      .from("track_plays")
      .select("track_id")
      .eq("user_id", userId)
      .limit(5000);

    if (!plays || plays.length === 0) {
      return { topTrack: null as TopTrack | null, topArtist: null as TopArtist | null };
    }

    const trackCounts = new Map<string, number>();
    for (const p of plays) {
      if (!p.track_id) continue;
      trackCounts.set(p.track_id, (trackCounts.get(p.track_id) ?? 0) + 1);
    }

    const trackIds = Array.from(trackCounts.keys());
    const { data: tracks } = await supabase
      .from("tracks")
      .select("id, title, cover_art_url, user_id")
      .in("id", trackIds);

    if (!tracks || tracks.length === 0) {
      return { topTrack: null, topArtist: null };
    }

    // Top track
    let topTrackRow = tracks[0];
    let topTrackPlays = trackCounts.get(topTrackRow.id) ?? 0;
    for (const t of tracks) {
      const n = trackCounts.get(t.id) ?? 0;
      if (n > topTrackPlays) {
        topTrackRow = t;
        topTrackPlays = n;
      }
    }

    // Artist aggregation
    const artistCounts = new Map<string, number>();
    for (const t of tracks) {
      const n = trackCounts.get(t.id) ?? 0;
      artistCounts.set(t.user_id, (artistCounts.get(t.user_id) ?? 0) + n);
    }
    let topArtistId = tracks[0].user_id;
    let topArtistPlays = artistCounts.get(topArtistId) ?? 0;
    for (const [id, n] of artistCounts) {
      if (n > topArtistPlays) {
        topArtistId = id;
        topArtistPlays = n;
      }
    }

    const artistIds = Array.from(new Set([topTrackRow.user_id, topArtistId]));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", artistIds);

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const topTrackArtist = profileById.get(topTrackRow.user_id);
    const topArtistProfile = profileById.get(topArtistId);

    const topTrack: TopTrack = {
      track_id: topTrackRow.id,
      title: topTrackRow.title,
      cover_art_url: topTrackRow.cover_art_url,
      artist_id: topTrackRow.user_id,
      artist_username: topTrackArtist?.username ?? null,
      plays: topTrackPlays,
    };

    const topArtist: TopArtist = {
      artist_id: topArtistId,
      username: topArtistProfile?.username ?? null,
      avatar_url: topArtistProfile?.avatar_url ?? null,
      plays: topArtistPlays,
    };

    return { topTrack, topArtist };
  });
