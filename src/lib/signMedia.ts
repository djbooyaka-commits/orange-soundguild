import { signMediaUrls } from "@/lib/api/media.functions";
import { supabase } from "@/integrations/supabase/client";

type Bucket = "audio" | "covers" | "avatars";
const AVATAR_TTL = 60 * 60 * 24 * 365;

async function signAvatarDirect(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, AVATAR_TTL);
  return data?.signedUrl ?? null;
}

export async function signOne(bucket: Bucket, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  if (bucket === "avatars") return signAvatarDirect(path);
  try {
    const { results } = await signMediaUrls({ data: { items: [{ bucket, path }] } });
    return results[0]?.url ?? null;
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
      needServer.push({ idx, bucket: it.bucket, path: it.path });
    }),
  );

  if (needServer.length > 0) {
    try {
      const { results } = await signMediaUrls({
        data: { items: needServer.map(({ bucket, path }) => ({ bucket, path })) },
      });
      needServer.forEach((it, i) => {
        out[it.idx] = results[i]?.url ?? null;
      });
    } catch {
      // Unauthenticated or server error — leave as null so callers fall back to defaults.
    }
  }
  return out;
}
