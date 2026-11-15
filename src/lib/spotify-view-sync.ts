// Spotify points sync on page view (no background job): a member's Spotify
// plays are checked when they open their profile, a playlist page or the
// Spotify card, at most once per interval.
export const SPOTIFY_VIEW_SYNC_INTERVAL_MS = 60 * 60 * 1000;

export function isSpotifyViewSyncDue(
  lastSyncAt: string | number | null | undefined,
  now: number = Date.now(),
  intervalMs: number = SPOTIFY_VIEW_SYNC_INTERVAL_MS,
): boolean {
  if (lastSyncAt == null || lastSyncAt === "") return true;
  const last = typeof lastSyncAt === "number" ? lastSyncAt : new Date(lastSyncAt).getTime();
  if (!Number.isFinite(last)) return true;
  return now - last >= intervalMs;
}

export function spotifyViewSyncCutoffIso(now: number = Date.now(), intervalMs: number = SPOTIFY_VIEW_SYNC_INTERVAL_MS) {
  return new Date(now - intervalMs).toISOString();
}
