import { mp3DurationSeconds, mp4DurationSeconds } from "@/lib/audio-duration";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

const HEAD_BYTES = 256 * 1024;
const TAIL_BYTES = 1024 * 1024;

async function fetchRange(url: string, range: string): Promise<{ bytes: Uint8Array; total: number } | null> {
  const res = await fetch(url, { headers: { Range: range } });
  if (!res.ok || !res.body) return null;
  const total = Number(res.headers.get("content-range")?.split("/")[1] ?? res.headers.get("content-length") ?? 0);
  // Read at most what we asked for, even if the server ignores Range.
  const limit = range.startsWith("bytes=-") ? TAIL_BYTES : HEAD_BYTES;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  while (got < limit) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    got += value.length;
  }
  void reader.cancel().catch(() => {});
  const bytes = new Uint8Array(Math.min(got, limit));
  let off = 0;
  for (const c of chunks) {
    const take = Math.min(c.length, bytes.length - off);
    if (take <= 0) break;
    bytes.set(c.subarray(0, take), off);
    off += take;
  }
  return { bytes, total: Number.isFinite(total) ? total : 0 };
}

async function measure(admin: Admin, audioPath: string): Promise<number | null> {
  if (/^https?:/i.test(audioPath)) return null;
  const { data } = await admin.storage.from("audio").createSignedUrl(audioPath, 120);
  if (!data?.signedUrl) return null;
  const ext = audioPath.split("?")[0]!.split(".").pop()?.toLowerCase() ?? "";
  const head = await fetchRange(data.signedUrl, `bytes=0-${HEAD_BYTES - 1}`);
  if (!head) return null;
  if (["m4a", "mp4", "mov", "aac", "m4v"].includes(ext)) {
    const fromHead = mp4DurationSeconds(head.bytes);
    if (fromHead) return fromHead;
    const tail = await fetchRange(data.signedUrl, `bytes=-${TAIL_BYTES}`);
    return tail ? mp4DurationSeconds(tail.bytes) : null;
  }
  return head.total > 0 ? mp3DurationSeconds(head.bytes, head.total) : null;
}

/**
 * The song's length in seconds, measured on the server from its audio file
 * and remembered until the file changes. Null when the file can't be read.
 */
export async function getTrackDurationSeconds(admin: Admin, trackId: string): Promise<number | null> {
  const [{ data: track }, { data: cached }] = await Promise.all([
    admin.from("tracks").select("audio_url").eq("id", trackId).maybeSingle(),
    admin.from("track_durations").select("audio_url, seconds").eq("track_id", trackId).maybeSingle(),
  ]);
  const audio = (track?.audio_url as string | null) ?? null;
  if (!audio) return null;
  if (cached && cached.audio_url === audio) return Number(cached.seconds) || null;
  let seconds: number | null = null;
  try {
    seconds = await measure(admin, audio);
  } catch {
    seconds = null;
  }
  // Ignore nonsense readings (under 5 s or over 3 h).
  if (!seconds || !Number.isFinite(seconds) || seconds < 5 || seconds > 3 * 3600) return null;
  await admin
    .from("track_durations")
    .upsert({ track_id: trackId, audio_url: audio, seconds, measured_at: new Date().toISOString() });
  return seconds;
}
