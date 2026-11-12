/**
 * Pure helpers for reading public Apple Music and Tidal playlist pages.
 * Network calls live in api/external-playlist.server.ts.
 */

export type ExternalTrack = { artist: string; name: string };

/** Reads the JSON block Apple Music embeds in every public playlist page. */
export function parseApplePlaylistPage(html: string): { tracks: ExternalTrack[]; name: string | null } {
  const m = html.match(/<script[^>]*id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { tracks: [], name: null };
  let data: any;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return { tracks: [], name: null };
  }
  const pages: any[] = Array.isArray(data?.data) ? data.data : [];
  const sections: any[] = pages.flatMap((p) => p?.data?.sections ?? []);
  const header = sections.find((s) => s?.itemKind === "containerDetailHeaderLockup");
  const name = (header?.items?.[0]?.title as string | undefined)?.trim() || null;
  const tracks: ExternalTrack[] = [];
  for (const s of sections) {
    if (s?.itemKind !== "trackLockup") continue;
    for (const it of s.items ?? []) {
      const title = String(it?.title ?? "").trim();
      const artist = String(
        it?.artistName ?? (it?.subtitleLinks ?? []).map((l: any) => l?.title).filter(Boolean).join(" & "),
      ).trim();
      if (title && artist) tracks.push({ artist, name: title });
    }
  }
  return { tracks, name };
}

/** Pulls the playlist id out of tidal.com / listen.tidal.com playlist links. */
export function tidalPlaylistId(raw: string): string | null {
  const m = raw.trim().match(/tidal\.com\/(?:browse\/)?playlists?\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1].toLowerCase() : null;
}

/** Reads track items from Tidal's public playlist API response. */
export function parseTidalApiItems(json: any): ExternalTrack[] {
  const out: ExternalTrack[] = [];
  for (const raw of json?.items ?? []) {
    const it = raw?.item ?? raw; // /items wraps tracks, /tracks does not
    const title = String(it?.title ?? "").trim();
    const version = String(it?.version ?? "").trim();
    const artist = String(it?.artist?.name ?? it?.artists?.[0]?.name ?? "").trim();
    if (!title || !artist) continue;
    out.push({ artist, name: version && !title.includes(version) ? `${title} (${version})` : title });
  }
  return out;
}

/** Fallback: Tidal's embed player lists the first songs in window.tidalMediaSessionMetadata. */
export function parseTidalEmbed(html: string): ExternalTrack[] {
  const marker = "window.tidalMediaSessionMetadata=";
  const i = html.indexOf(marker);
  if (i < 0) return [];
  const start = i + marker.length;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        const obj = JSON.parse(html.slice(start, j + 1)) as Record<string, any>;
        return Object.values(obj)
          .map((t) => ({ artist: String(t?.artist ?? "").trim(), name: String(t?.title ?? "").trim() }))
          .filter((t) => t.artist && t.name);
      } catch {
        return [];
      }
    }
  }
  return [];
}
