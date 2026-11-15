import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { syncSpotifyPointsOnView } from "@/lib/api/spotify.functions";
import { isSpotifyViewSyncDue } from "@/lib/spotify-view-sync";

const STORAGE_KEY = "osg:spotifyViewSyncAt";

/**
 * Checks the signed-in member's Spotify plays for points when a page opens.
 * The server allows one check per hour; the browser also remembers the last
 * attempt so navigating between pages doesn't even ask.
 */
export function useSpotifyViewSync(enabled = true, onSynced?: (added: number) => void) {
  const { user } = useAuth();
  const syncFn = useServerFn(syncSpotifyPointsOnView);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!enabled || !userId) return;
    const key = `${STORAGE_KEY}:${userId}`;
    try {
      const last = Number(window.localStorage.getItem(key) ?? "");
      if (!isSpotifyViewSyncDue(Number.isFinite(last) && last > 0 ? last : null)) return;
      window.localStorage.setItem(key, String(Date.now()));
    } catch {
      // storage unavailable: the server-side throttle still applies
    }
    let cancelled = false;
    syncFn()
      .then((r) => {
        if (!cancelled && r.synced) onSynced?.(r.added ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId]);
}
