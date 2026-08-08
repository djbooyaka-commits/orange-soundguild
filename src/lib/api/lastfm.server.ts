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
