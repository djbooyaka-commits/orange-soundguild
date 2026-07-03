import { signMediaUrls } from "@/lib/api/media.functions";

type Bucket = "audio" | "covers" | "avatars";

export async function signOne(bucket: Bucket, path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { results } = await signMediaUrls({ data: { items: [{ bucket, path }] } });
  return results[0]?.url ?? null;
}

export async function signMany(items: { bucket: Bucket; path: string | null | undefined }[]): Promise<(string | null)[]> {
  const filtered = items.map((it, idx) => ({ idx, bucket: it.bucket, path: it.path }));
  const needSign = filtered.filter((it) => it.path && !it.path.startsWith("http"));
  const out: (string | null)[] = items.map((it) =>
    it.path ? (it.path.startsWith("http") ? it.path : null) : null,
  );
  if (needSign.length === 0) return out;
  const { results } = await signMediaUrls({
    data: { items: needSign.map(({ bucket, path }) => ({ bucket, path: path as string })) },
  });
  needSign.forEach((it, i) => {
    out[it.idx] = results[i]?.url ?? null;
  });
  return out;
}
