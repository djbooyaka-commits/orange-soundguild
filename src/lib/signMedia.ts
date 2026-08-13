import { signMediaUrls } from "@/lib/api/media.functions";
import { supabase } from "@/integrations/supabase/client";

type Bucket = "audio" | "covers" | "avatars";
const AVATAR_TTL = 60 * 60 * 24 * 365;

// Cache signed URLs so repeat navigation doesn't re-sign (and re-download)
// the same media. Kept a bit under the server TTL (6h) for safety.
const CACHE_TTL_MS = 5 * 60 * 60 * 1000;
const STORAGE_KEY = "osg:signed-media:v1";

type Entry = { url: string; exp: number };
const memCache = new Map<string, Entry>();
let loaded = false;

function loadCache() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, Entry>;
    const now = Date.now();
    for (const [k, v] of Object.entries(parsed)) {
      if (v && v.exp > now) memCache.set(k, v);
    }
  } catch {
    /* ignore */
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistCache() {
  if (typeof window === "undefined") return;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(memCache)));
    } catch {
      /* quota / private mode — cache stays in memory only */
    }
  }, 500);
}

function getCached(bucket: Bucket, path: string): string | null {
  loadCache();
  const hit = memCache.get(`${bucket}:${path}`);
  if (!hit) return null;
  if (hit.exp <= Date.now()) {
    memCache.delete(`${bucket}:${path}`);
    return null;
  }
  return hit.url;
}

function setCached(bucket: Bucket, path: string, url: string | null, ttlMs = CACHE_TTL_MS) {
  if (!url) return;
  memCache.set(`${bucket}:${path}`, { url, exp: Date.now() + ttlMs });
  persistCache();
}

async function signAvatarDirect(path: string): Promise<string | null> {
  const cached = getCached("avatars", path);
  if (cached) return cached;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, AVATAR_TTL);
  const url = data?.signedUrl ?? null;
  setCached("avatars", path, url, 24 * 60 * 60 * 1000);
  return url;
}

export async function signOne(bucket: Bucket, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  if (bucket === "avatars") return signAvatarDirect(path);
  const cached = getCached(bucket, path);
  if (cached) return cached;
  try {
    const { results } = await signMediaUrls({ data: { items: [{ bucket, path }] } });
    const url = results[0]?.url ?? null;
    setCached(bucket, path, url);
    return url;
  } catch {
    return null;
  }
}

export async function signMany(items: { bucket: Bucket; path: string | null | undefined }[]): Promise<(string | null)[]> {
  const out: (string | null)[] = new Array(items.length).fill(null);
  const needServer: { idx: number; bucket: Bucket; path: string }[] = [];

  await Promise.all(
    items.map(async (it, idx) => {
      if (!it.path) return;
      if (it.path.startsWith("http")) {
        out[idx] = it.path;
        return;
      }
      if (it.bucket === "avatars") {
        out[idx] = await signAvatarDirect(it.path);
        return;
      }
      const cached = getCached(it.bucket, it.path);
      if (cached) {
        out[idx] = cached;
        return;
      }
      needServer.push({ idx, bucket: it.bucket, path: it.path });
    }),
  );

  if (needServer.length > 0) {
    // De-duplicate identical paths so one signature covers all of them.
    const unique = new Map<string, { bucket: Bucket; path: string; idxs: number[] }>();
    for (const it of needServer) {
      const key = `${it.bucket}:${it.path}`;
      const existing = unique.get(key);
      if (existing) existing.idxs.push(it.idx);
      else unique.set(key, { bucket: it.bucket, path: it.path, idxs: [it.idx] });
    }
    const list = Array.from(unique.values());

    try {
      for (let start = 0; start < list.length; start += 100) {
        const batch = list.slice(start, start + 100);
        const { results } = await signMediaUrls({
          data: { items: batch.map(({ bucket, path }) => ({ bucket, path })) },
        });
        batch.forEach((it, i) => {
          const url = results[i]?.url ?? null;
          setCached(it.bucket, it.path, url);
          it.idxs.forEach((idx) => {
            out[idx] = url;
          });
        });
      }
    } catch {
      // Server error — leave as null so callers fall back to defaults.
    }
  }
  return out;
}
