// Server-only Last.fm helper for reading a user's recently scrobbled tracks.
// Last.fm's user.getRecentTracks endpoint is PUBLIC — no per-user OAuth, no
// user cap. One API key works for all users. This is the key advantage over
// Spotify's development-mode 25-user allowlist.

function normalize(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    // Remove common parenthetical and bracketed annotations
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s*\[.*?\]\s*/g, " ")
    .trim();
}

/** Returns true if a Last.fm scrobble matches a watch-list track. */
export function matchTrack(
  lastfmName: string,
  lastfmArtist: string,
  watchName: string,
  watchArtist: string,
): boolean {
  return normalize(lastfmName) === normalize(watchName) &&
    normalize(lastfmArtist) === normalize(watchArtist);
}

export interface LastfmScrobble {
  name: string;
  artist: string;
  playedAt: string; // ISO timestamp
  uts: number; // UNIX timestamp (seconds)
}

/**
 * Validates the configured Last.fm API key.
 * Last.fm keys are 32-character lowercase hex strings.
 * Returns a friendly error code instead of throwing so callers can surface it.
 */
export function getLastfmApiKey(): { key: string | null; error: string | null } {
  const raw = process.env["LASTFM_API_KEY"];
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key) return { key: null, error: "lastfm_key_missing" };
  if (!/^[0-9a-fA-F]{32}$/.test(key)) return { key: null, error: "lastfm_key_malformed" };
  return { key, error: null };
}

/** Human-readable message for a Last.fm error code. */
export function lastfmErrorMessage(code: string): string {
  switch (code) {
    case "lastfm_key_missing":
      return "Last.fm tracking isn't configured yet — the site's Last.fm API key is missing. An admin needs to add it.";
    case "lastfm_key_malformed":
      return "The site's Last.fm API key is invalid (it must be a 32-character key from last.fm/api/account/create). An admin needs to fix it.";
    case "lastfm_key_rejected":
      return "Last.fm rejected the site's API key. It may have been revoked or mistyped — an admin needs to replace it.";
    case "lastfm_user_not_found":
      return "That Last.fm username doesn't exist — check the spelling.";
    case "lastfm_rate_limited":
      return "Last.fm is rate-limiting requests right now. Try again in a minute.";
    case "lastfm_unavailable":
      return "Last.fm is temporarily unavailable. Try again shortly.";
    default:
      return `Last.fm error: ${code}`;
  }
}

/** Maps a Last.fm API error code number to our internal code. */
function mapLastfmApiError(code: number): string {
  switch (code) {
    case 6:
      return "lastfm_user_not_found";
    case 10:
    case 26:
      return "lastfm_key_rejected";
    case 29:
      return "lastfm_rate_limited";
    case 8:
    case 11:
    case 16:
      return "lastfm_unavailable";
    default:
      return `lastfm_${code}`;
  }
}

/** Fetches a user's recent scrobbles from Last.fm, optionally after a UNIX timestamp. */
export async function fetchLastfmRecentTracks(
  username: string,
  apiKey: string,
  fromTimestamp?: number,
): Promise<{ items: LastfmScrobble[]; error: string | null }> {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.searchParams.set("method", "user.getRecentTracks");
  url.searchParams.set("user", username);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "200");
  if (fromTimestamp) {
    url.searchParams.set("from", String(fromTimestamp));
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    console.error(`Last.fm recent tracks failed [${res.status}]: ${text}`);
    return {
      items: [],
      error: res.status === 404 ? "lastfm_user_not_found" : `lastfm_${res.status}`,
    };
  }
  const body = await res.json();
  if (body?.error) {
    return { items: [], error: `lastfm_${body.error}` };
  }

  const tracks: any[] = body?.recenttracks?.track ?? [];
  // Filter out "now playing" tracks (no date) and map to our shape
  const items: LastfmScrobble[] = tracks
    .filter((t) => t.date?.uts && !t["@attr"]?.nowplaying)
    .map((t) => ({
      name: (t.name ?? "") as string,
      artist: ((t.artist?.["#text"] ?? "") as string),
      playedAt: new Date(parseInt(t.date.uts, 10) * 1000).toISOString(),
      uts: parseInt(t.date.uts, 10),
    }));

  return { items, error: null };
}
