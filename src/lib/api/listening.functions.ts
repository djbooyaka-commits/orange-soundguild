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

export type FollowingUser = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
};

async function computeStats(supabase: any, userId: string) {
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

  let topTrackRow = tracks[0];
  let topTrackPlays = trackCounts.get(topTrackRow.id) ?? 0;
  for (const t of tracks) {
    const n = trackCounts.get(t.id) ?? 0;
    if (n > topTrackPlays) {
      topTrackRow = t;
      topTrackPlays = n;
    }
  }

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

  const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const topTrackArtist: any = profileById.get(topTrackRow.user_id);
  const topArtistProfile: any = profileById.get(topArtistId);

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
}

export const getMyListeningStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return computeStats(context.supabase, context.userId);
  });

export const getSuperfanPublicProfile = createServerFn({ method: "GET" })
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Only expose stats if the target user is a superfan
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("account_type")
      .eq("id", data.userId)
      .maybeSingle();

    if (!prof || prof.account_type !== "superfan") {
      return {
        isSuperfan: false as const,
        topTrack: null as TopTrack | null,
        topArtist: null as TopArtist | null,
        following: [] as FollowingUser[],
      };
    }

    const stats = await computeStats(supabaseAdmin, data.userId);

    const { data: follows } = await supabaseAdmin
      .from("follows")
      .select("following_id")
      .eq("follower_id", data.userId)
      .limit(200);

    const ids = (follows ?? []).map((f: any) => f.following_id);
    let following: FollowingUser[] = [];
    if (ids.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", ids);
      following = (profs ?? []).map((p: any) => ({
        user_id: p.id,
        username: p.username,
        avatar_url: p.avatar_url,
      }));
    }

    return { isSuperfan: true as const, ...stats, following };
  });
