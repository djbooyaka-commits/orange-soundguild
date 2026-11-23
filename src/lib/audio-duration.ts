// Reads a song's length from the first bytes of its file (and, for MP4/M4A,
// the end of the file) so the server knows how long a full play takes
// without downloading or trusting the browser.

const BITRATES: Record<string, number[]> = {
  "1-1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  "1-2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  "1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  "2-1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  "2-2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  "2-3": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

type Frame = { bitrate: number; sampleRate: number; spf: number; size: number; mpeg1: boolean; mono: boolean };

function readFrame(b: Uint8Array, i: number): Frame | null {
  if (i + 4 > b.length || b[i] !== 0xff || ((b[i + 1] ?? 0) & 0xe0) !== 0xe0) return null;
  const b1 = b[i + 1]!, b2 = b[i + 2]!, b3 = b[i + 3]!;
  const ver = (b1 >> 3) & 3;
  const layerBits = (b1 >> 1) & 3;
  if (ver === 1 || layerBits === 0) return null;
  const layer = 4 - layerBits; // 1, 2 or 3
  const mpeg1 = ver === 3;
  const bitrate = BITRATES[`${mpeg1 ? 1 : 2}-${layer}`]?.[b2 >> 4] ?? 0;
  const sampleRate = RATES[ver]?.[(b2 >> 2) & 3] ?? 0;
  if (!bitrate || !sampleRate) return null;
  const pad = (b2 >> 1) & 1;
  const spf = layer === 1 ? 384 : layer === 2 || mpeg1 ? 1152 : 576;
  const size = layer === 1
    ? Math.floor((12 * bitrate * 1000) / sampleRate + pad) * 4
    : Math.floor((spf / 8) * bitrate * 1000 / sampleRate) + pad;
  return { bitrate, sampleRate, spf, size, mpeg1, mono: b3 >> 6 === 3 };
}

const u32 = (b: Uint8Array, i: number) =>
  (((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0;
const tag = (b: Uint8Array, i: number) => String.fromCharCode(b[i] ?? 0, b[i + 1] ?? 0, b[i + 2] ?? 0, b[i + 3] ?? 0);

/** Seconds of audio in an MP3, from its first bytes and the total file size. */
export function mp3DurationSeconds(head: Uint8Array, totalBytes: number): number | null {
  let start = 0;
  if (tag(head, 0).startsWith("ID3")) {
    const size = (((head[6] ?? 0) & 0x7f) << 21) | (((head[7] ?? 0) & 0x7f) << 14) |
      (((head[8] ?? 0) & 0x7f) << 7) | ((head[9] ?? 0) & 0x7f);
    start = 10 + size + (((head[5] ?? 0) & 0x10) ? 10 : 0);
  }
  for (let i = start; i < head.length - 4; i += 1) {
    const f = readFrame(head, i);
    if (!f) continue;
    // Require a second valid frame right after, unless it falls past what we read.
    const next = i + f.size;
    if (next + 4 <= head.length && !readFrame(head, next)) continue;
    const side = f.mpeg1 ? (f.mono ? 17 : 32) : f.mono ? 9 : 17;
    const x = i + 4 + side;
    const xt = tag(head, x);
    if (xt === "Xing" || xt === "Info") {
      const flags = u32(head, x + 4);
      if (flags & 1) {
        const frames = u32(head, x + 8);
        if (frames > 0) return (frames * f.spf) / f.sampleRate;
      }
    }
    if (tag(head, i + 36) === "VBRI") {
      const frames = u32(head, i + 36 + 14);
      if (frames > 0) return (frames * f.spf) / f.sampleRate;
    }
    const audioBytes = totalBytes - i;
    return audioBytes > 0 ? (audioBytes * 8) / (f.bitrate * 1000) : null;
  }
  return null;
}

/** Seconds from an MP4/M4A/MOV "mvhd" box found anywhere in the bytes. */
export function mp4DurationSeconds(bytes: Uint8Array): number | null {
  for (let i = 4; i < bytes.length - 32; i += 1) {
    if (bytes[i] !== 0x6d || tag(bytes, i) !== "mvhd") continue;
    const v = bytes[i + 4];
    let timescale: number, duration: number;
    if (v === 1) {
      timescale = u32(bytes, i + 4 + 4 + 16);
      duration = u32(bytes, i + 4 + 4 + 20) * 2 ** 32 + u32(bytes, i + 4 + 4 + 24);
    } else if (v === 0) {
      timescale = u32(bytes, i + 4 + 4 + 8);
      duration = u32(bytes, i + 4 + 4 + 12);
    } else continue;
    if (timescale > 0 && duration > 0) return duration / timescale;
  }
  return null;
}

/** Real time (ms) a play must last before it earns OSG room points. */
export function requiredPlayMs(durationSeconds: number | null, floorMs = 30_000): number {
  if (!durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return floorMs;
  // The player needs 99% played; allow a little for network delay around the
  // start/finish calls. Songs shorter than the floor need 90% of their length.
  const ms = durationSeconds * 1000;
  return Math.round(Math.max(ms * 0.97 - 2000, Math.min(floorMs, ms * 0.9)));
}

/** True if two plays [start, end) overlap in time. */
export function playsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}
