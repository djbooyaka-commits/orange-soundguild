import { createServerFn } from "@tanstack/react-start";

export type IsrcTrack = {
  id: string; name: string; artists: string; isrc: string | null; album: string;
  albumId: string; image: string | null; released: string | null; url: string; durationMs: number; trackNumber: number;
};
export type IsrcAlbum = {
  id: string; name: string; artists: string; upc: string | null; ean: string | null; label: string | null;
  image: string | null; released: string | null; url: string; totalTracks: number; tracks: IsrcTrack[];
};
export type IsrcResult = { tracks: IsrcTrack[]; albums: IsrcAlbum[]; error?: string };

let cached: { token: string; exp: number } | null = null;
async function appToken() {
  if (cached && cached.exp > Date.now() + 30_000) return cached.token;
  const basic = btoa(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`);
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const j: any = await res.json();
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}
async function sp(path: string) {
  const res = await fetch(`https://api.spotify.com/v1/${path}`, { headers: { Authorization: `Bearer ${await appToken()}` } });
  if (!res.ok) throw new Error(`spotify ${res.status}`);
  return res.json() as Promise<any>;
}
const artistsOf = (a: any[]) => (a ?? []).map((x) => x.name).join(", ");
function toTrack(t: any, album?: any): IsrcTrack {
  const al = t.album ?? album ?? {};
  return {
    id: t.id, name: t.name, artists: artistsOf(t.artists), isrc: t.external_ids?.isrc ?? null,
    album: al.name ?? "", albumId: al.id ?? "", image: al.images?.[0]?.url ?? null,
    released: al.release_date ?? null, url: t.external_urls?.spotify ?? "", durationMs: t.duration_ms ?? 0,
    trackNumber: t.track_number ?? 0,
  };
}
async function fullAlbum(id: string, withTracks = true): Promise<IsrcAlbum> {
  const a = await sp(`albums/${id}`);
  // Spotify blocks the bulk tracks endpoint for this app, so fetch each track (ISRC lives there).
  const ids: string[] = withTracks ? (a.tracks?.items ?? []).map((t: any) => t.id).filter(Boolean).slice(0, 40) : [];
  const full = await Promise.all(ids.map((tid) => sp(`tracks/${tid}`).catch(() => null)));
  return {
    id: a.id, name: a.name, artists: artistsOf(a.artists), upc: a.external_ids?.upc ?? null,
    ean: a.external_ids?.ean ?? null, label: a.label ?? null, image: a.images?.[0]?.url ?? null,
    released: a.release_date ?? null, url: a.external_urls?.spotify ?? "", totalTracks: a.total_tracks ?? 0,
    tracks: full.filter(Boolean).map((t: any) => toTrack(t, a)),
  };
}

/** Classifies what the user typed so the lookup picks the right Spotify query. */
export function parseIsrcQuery(raw: string):
  | { kind: "track" | "album"; id: string }
  | { kind: "isrc"; code: string }
  | { kind: "upc"; code: string }
  | { kind: "text"; q: string } {
  const q = raw.trim();
  const link = q.match(/(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?|spotify:)(track|album)[/:]([A-Za-z0-9]{22})/);
  if (link) return { kind: link[1] as "track" | "album", id: link[2]! };
  const compact = q.replace(/[-\s]/g, "").toUpperCase();
  if (/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(compact)) return { kind: "isrc", code: compact };
  if (/^\d{12,14}$/.test(compact)) return { kind: "upc", code: compact };
  return { kind: "text", q };
}

export const lookupIsrc = createServerFn({ method: "POST" })
  .inputValidator((d: { q: string; type?: "track" | "album" }) => ({
    q: String(d?.q ?? "").slice(0, 200), type: d?.type === "album" ? "album" as const : "track" as const,
  }))
  .handler(async ({ data }): Promise<IsrcResult> => {
    const p = parseIsrcQuery(data.q);
    try {
      if (p.kind === "text" && !p.q) return { tracks: [], albums: [] };
      if (p.kind === "track") return { tracks: [toTrack(await sp(`tracks/${p.id}`))], albums: [] };
      if (p.kind === "album") return { tracks: [], albums: [await fullAlbum(p.id)] };
      if (p.kind === "isrc") {
        const r = await sp(`search?type=track&limit=10&q=${encodeURIComponent(`isrc:${p.code}`)}`);
        return { tracks: (r.tracks?.items ?? []).map((t: any) => toTrack(t)), albums: [] };
      }
      if (p.kind === "upc") {
        const r = await sp(`search?type=album&limit=3&q=${encodeURIComponent(`upc:${p.code}`)}`);
        const albums = await Promise.all((r.albums?.items ?? []).map((a: any) => fullAlbum(a.id)));
        return { tracks: [], albums };
      }
      if (data.type === "album") {
        const r = await sp(`search?type=album&limit=5&q=${encodeURIComponent(p.q)}`);
        const albums = await Promise.all((r.albums?.items ?? []).slice(0, 5).map((a: any, i: number) => fullAlbum(a.id, i === 0)));
        return { tracks: [], albums };
      }
      const r = await sp(`search?type=track&limit=15&q=${encodeURIComponent(p.q)}`);
      return { tracks: (r.tracks?.items ?? []).map((t: any) => toTrack(t)), albums: [] };
    } catch (e) {
      console.error("lookupIsrc failed", e);
      return { tracks: [], albums: [], error: "Lookup failed — please try again in a moment." };
    }
  });
