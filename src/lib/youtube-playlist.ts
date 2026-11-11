/**
 * Pure helpers for reading a public YouTube / YouTube Music playlist page.
 * Network calls live in api/youtube-playlist.server.ts.
 */

export type YoutubeTrack = { artist: string; name: string; videoId: string };

/** Pulls the playlist id (list=...) out of any YouTube or YouTube Music link. */
export function youtubePlaylistId(raw: string): string | null {
  try {
    const id = new URL(raw.trim()).searchParams.get("list");
    return id && /^[A-Za-z0-9_-]{2,64}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Reads the JSON object assigned to `ytInitialData` inside the page HTML. */
export function extractInitialData(html: string): any | null {
  const marker = html.search(/(?:var\s+ytInitialData|window\["ytInitialData"\])\s*=\s*\{/);
  if (marker < 0) return null;
  const start = html.indexOf("{", marker);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const textOf = (t: any): string =>
  (t?.simpleText as string) ?? ((t?.runs ?? []) as any[]).map((r) => r?.text ?? "").join("");

/** Splits a video title + channel into artist and song, dropping "(Official Video)" style tags. */
export function cleanYoutubeTitle(title: string, channel: string): { artist: string; name: string } {
  const strip = (s: string) =>
    s
      .replace(/\s*[([][^)\]]*(official|lyric|lyrics|audio|video|visualizer|mv|hd|4k)[^)\]]*[)\]]/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  const parts = title.split(/\s+[-–—]\s+/);
  if (parts.length >= 2 && parts[0].trim() && parts.slice(1).join(" - ").trim()) {
    return { artist: parts[0].trim(), name: strip(parts.slice(1).join(" - ")) || parts[1].trim() };
  }
  const artist = channel.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim() || "Unknown";
  return { artist, name: strip(title) || title.trim() };
}

/** Finds the first continuationCommand token anywhere inside a continuation item. */
function findToken(item: any): string | null {
  const stack = [item];
  while (stack.length) {
    const n = stack.pop();
    if (!n || typeof n !== "object") continue;
    const t = n.continuationCommand?.token;
    if (typeof t === "string") return t;
    for (const v of Object.values(n)) stack.push(v);
  }
  return null;
}

/** Walks YouTube page/continuation JSON and returns its tracks and the next-page token. */
export function parsePlaylistItems(root: any): { tracks: YoutubeTrack[]; continuation: string | null } {
  const tracks: YoutubeTrack[] = [];
  let continuation: string | null = null;
  const stack: any[] = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      // The next-page token sits in the same list as the songs, not in "related" shelves
      if (node.some((x) => x?.playlistVideoRenderer)) {
        const tok = findToken(node.find((x) => x?.continuationItemRenderer));
        if (tok) continuation = tok;
      }
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
      continue;
    }
    const v = node.playlistVideoRenderer;
    if (v?.videoId && v.isPlayable !== false) {
      const title = textOf(v.title);
      const channel = textOf(v.shortBylineText);
      if (title) tracks.push({ ...cleanYoutubeTitle(title, channel), videoId: v.videoId });
      continue;
    }
    for (const k of Object.keys(node)) stack.push(node[k]);
  }
  return { tracks, continuation };
}
