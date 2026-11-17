// Removes songs that have been on a submission playlist longer than its hold days.
// Only runs for playlists where the curator turned "Auto-remove old songs" on, and never
// for team playlists (or OSG Artists playlists), whose member tracks follow the star rules.

type CuratorRow = {
  id: string;
  curator_id: string;
  spotify_playlist_id: string;
  track_hold_days: number | null;
  is_team: boolean | null;
  is_osg: boolean | null;
  auto_remove_expired: boolean | null;
};

type BetaRow = {
  id: string;
  room_id: string;
  spotify_playlist_id: string;
  track_hold_days: number | null;
  is_team: boolean | null;
  platform: string | null;
  auto_remove_expired: boolean | null;
};

export function canAutoRemoveExpired(row: {
  is_team?: boolean | null;
  is_osg?: boolean | null;
  platform?: string | null;
}) {
  return !row.is_team && !row.is_osg && (row.platform ?? "spotify") === "spotify";
}

export async function cleanupCuratorPlaylist(supabaseAdmin: any, row: CuratorRow) {
  if (!row.auto_remove_expired || !canAutoRemoveExpired(row)) return { removed: 0, error: null as string | null };
  const days = Number(row.track_hold_days ?? 30);
  const { getCuratorAccessToken } = await import("./curator-submissions.functions");
  const tok: any = await getCuratorAccessToken(row.curator_id, supabaseAdmin);
  if (!tok?.accessToken) return { removed: 0, error: (tok?.error as string) ?? "no_token" };
  const { removeExpiredSpotifyTracks } = await import("./beta-auto-remove.server");
  return removeExpiredSpotifyTracks(tok.accessToken, row.spotify_playlist_id, days);
}

export async function cleanupBetaPlaylist(supabaseAdmin: any, row: BetaRow, ownerId: string) {
  if (!row.auto_remove_expired || !canAutoRemoveExpired(row)) return { removed: 0, error: null as string | null };
  const days = Number(row.track_hold_days ?? 30);
  const { getBetaAccessToken } = await import("./beta-spotify.server");
  const token = await getBetaAccessToken(ownerId, supabaseAdmin);
  if (!token) return { removed: 0, error: "no_token" };
  const { removeExpiredSpotifyTracks } = await import("./beta-auto-remove.server");
  return removeExpiredSpotifyTracks(token, row.spotify_playlist_id, days);
}

export const CURATOR_EXPIRY_COLUMNS =
  "id, curator_id, spotify_playlist_id, track_hold_days, is_team, is_osg, auto_remove_expired";
export const BETA_EXPIRY_COLUMNS =
  "id, room_id, spotify_playlist_id, track_hold_days, is_team, platform, auto_remove_expired";
