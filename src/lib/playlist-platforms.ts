export type PlaylistPlatform = "spotify" | "youtube" | "tidal" | "apple_music" | "osg";

export const PLATFORM_LABELS: Record<PlaylistPlatform, string> = {
  spotify: "Spotify",
  youtube: "YouTube",
  tidal: "Tidal",
  apple_music: "Apple Music",
  osg: "Orange Sound Guild",
};

export const PLATFORM_SCROBBLE_TIPS: Record<PlaylistPlatform, string> = {
  spotify: "Connect Spotify in your Last.fm settings (Applications).",
  youtube: "Use the Web Scrobbler browser extension, or a scrobbler app on Android.",
  tidal: "Turn on Last.fm in Tidal settings (Connected services).",
  apple_music: "Use the Last.fm app on iPhone/Mac, or Web Scrobbler on music.apple.com.",
  osg: "Open this playlist's tab and press Play — full plays on Orange Sound Guild earn points automatically.",
};

/** Detects the streaming service of a playlist link, or null when unsupported. */
export function detectPlaylistPlatform(raw: string): PlaylistPlatform | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const h = u.hostname.toLowerCase().replace(/^www\./, "");
  if (h === "open.spotify.com" || h === "spotify.link") return "spotify";
  if (h === "youtube.com" || h === "m.youtube.com" || h === "music.youtube.com" || h === "youtu.be")
    return "youtube";
  if (h === "tidal.com" || h === "listen.tidal.com") return "tidal";
  if (h === "music.apple.com" || h === "itunes.apple.com") return "apple_music";
  if (h === "orangesoundguild.com" || h.endsWith(".lovable.app")) return "osg";
  return null;
}

/** Parses pasted "Artist - Song" lines into tracks. */
export function parseTracklist(text: string): Array<{ artist: string; name: string }> {
  const out: Array<{ artist: string; name: string }> = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const clean = line.replace(/^\s*\d+[.)]\s*/, "").trim();
    if (!clean) continue;
    const m = clean.split(/\s+[-–—]\s+/);
    if (m.length < 2) continue;
    const artist = m[0].trim();
    const name = m.slice(1).join(" - ").trim();
    if (!artist || !name) continue;
    const key = `${artist.toLowerCase()}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ artist, name });
  }
  return out;
}

/** Example track link shown in submission boxes for each service. */
export const TRACK_LINK_PLACEHOLDERS: Record<PlaylistPlatform, string> = {
  spotify: "https://open.spotify.com/track/...",
  youtube: "https://music.youtube.com/watch?v=...",
  tidal: "https://tidal.com/browse/track/...",
  apple_music: "https://music.apple.com/.../song/...",
  osg: "https://orangesoundguild.com/track/...",
};

/** Returns an error message when a track link doesn't belong to the playlist's service. */
export function trackLinkError(platform: string, url: string): string | null {
  const p = (platform || "spotify") as PlaylistPlatform;
  const label = PLATFORM_LABELS[p] ?? platform;
  if (p === "spotify") {
    return /open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/[A-Za-z0-9]+|^spotify:track:/i.test(url.trim())
      ? null
      : "Paste a Spotify track link (open.spotify.com/track/…)";
  }
  return detectPlaylistPlatform(url) === p ? null : `Paste a ${label} track link for this playlist`;
}

/** Stable id for a non-Spotify track so duplicates and hold days still work. */
export function externalTrackKey(t: { name: string; artist: string | null }): string {
  return `ext:${(t.artist ?? "").toLowerCase()}|${t.name.toLowerCase()}`.slice(0, 250);
}
