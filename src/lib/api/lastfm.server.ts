// Server-only Last.fm helper for reading a user's recently scrobbled tracks.
// Last.fm's user.getRecentTracks endpoint is PUBLIC — no per-user OAuth, no
// user cap. One API key works for all users. This is the key advantage over
// Spotify's development-mode 25-user allowlist.

function normalize(str: string): string {
  return str
    .toLowerCase()
    .trim()
    // Remove common parenthetical and bracketed annotations
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s*\[.*?\]\s*/g, " ")
    // Strip trailing " - Radio Edit" / " - Original Mix" / " - Drum and Bass" style suffixes
    .replace(/\s+-\s+[^-]*$/, " ")
    // Drop punctuation so "&"/"and", apostrophes and dots don't break matches
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits a credited-artists string into individual normalized artist names. */
function artistSet(str: string): string[] {
  return str
    .split(/,|\/|\bfeat\.?\b|\bft\.?\b|\bwith\b|\bx\b|&/i)
    .map((a) => normalize(a))
    .filter(Boolean);
}

/** Returns true if a Last.fm scrobble matches a watch-list track. */
export function matchTrack(
  lastfmName: string,
  lastfmArtist: string,
  watchName: string,
  watchArtist: string,
): boolean {
  if (normalize(lastfmName) !== normalize(watchName)) return false;
  const a = artistSet(lastfmArtist);
  const b = artistSet(watchArtist);
  // Watch-list rows imported without artist metadata still match on title alone.
  if (a.length === 0 || b.length === 0) return true;
  return a.some((x) => b.includes(x));
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

/**
 * Fetches a user's recent scrobbles from Last.fm, optionally after a UNIX timestamp.
 * Last.fm caps each response at 200 scrobbles, so long listening sessions need
 * every page walked — otherwise plays beyond the first 200 are silently dropped.
 */
export async function fetchLastfmRecentTracks(
  username: string,
  apiKey: string,
  fromTimestamp?: number,
  maxPages = 25,
): Promise<{ items: LastfmScrobble[]; error: string | null }> {
  const all: LastfmScrobble[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    url.searchParams.set("method", "user.getRecentTracks");
    url.searchParams.set("user", username);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "200");
    url.searchParams.set("page", String(page));
    if (fromTimestamp) {
      url.searchParams.set("from", String(fromTimestamp));
    }

    let res: Response;
    try {
      res = await fetch(url.toString());
    } catch (e) {
      console.error("Last.fm request failed", e);
      return { items: all, error: all.length ? null : "lastfm_unavailable" };
    }

    let body: any = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    if (body?.error) {
      const err = mapLastfmApiError(Number(body.error));
      return { items: all, error: all.length ? null : err };
    }
    if (!res.ok) {
      console.error(`Last.fm recent tracks failed [${res.status}]`);
      let err = `lastfm_${res.status}`;
      if (res.status === 403) err = "lastfm_key_rejected";
      else if (res.status === 404) err = "lastfm_user_not_found";
      else if (res.status === 429) err = "lastfm_rate_limited";
      else if (res.status >= 500) err = "lastfm_unavailable";
      return { items: all, error: all.length ? null : err };
    }

    // Last.fm returns a single object (not an array) when there is exactly one scrobble.
    const rawTracks = body?.recenttracks?.track;
    const tracks: any[] = Array.isArray(rawTracks) ? rawTracks : rawTracks ? [rawTracks] : [];
    // Filter out "now playing" tracks (no date) and map to our shape
    for (const t of tracks) {
      if (!t?.date?.uts || t["@attr"]?.nowplaying) continue;
      const uts = parseInt(t.date.uts, 10);
      const name = (t.name ?? "") as string;
      const artist = (t.artist?.["#text"] ?? "") as string;
      const dedupeKey = `${uts}|${name}|${artist}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      all.push({
        name,
        artist,
        playedAt: new Date(uts * 1000).toISOString(),
        uts,
      });
    }

    const totalPages = Number(body?.recenttracks?.["@attr"]?.totalPages ?? 1) || 1;
    if (page >= totalPages) break;
  }

  return { items: all, error: null };
}

