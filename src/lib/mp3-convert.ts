// Browser-only: converts uncompressed/lossless audio (WAV, AIFF, FLAC) to a 320 kbps MP3.
export function needsMp3Conversion(f: File) {
  return /\.(wav|aiff?|flac)$/i.test(f.name) || /audio\/(wav|x-wav|aiff|x-aiff|flac|x-flac)/i.test(f.type);
}

export async function convertToMp3(file: File, onProgress?: (pct: number) => void): Promise<File> {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const ctx = new AudioContext();
  let buf: AudioBuffer;
  try {
    buf = await ctx.decodeAudioData(await file.arrayBuffer());
  } finally {
    void ctx.close();
  }
  const channels = Math.min(2, buf.numberOfChannels);
  const enc = new Mp3Encoder(channels, buf.sampleRate, 320);
  const toInt16 = (f: Float32Array) => {
    const out = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) {
      const s = Math.max(-1, Math.min(1, f[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  };
  const left = toInt16(buf.getChannelData(0));
  const right = channels > 1 ? toInt16(buf.getChannelData(1)) : left;
  const parts: BlobPart[] = [];
  const block = 1152 * 200;
  for (let i = 0; i < left.length; i += block) {
    const l = left.subarray(i, i + block);
    const chunk = channels > 1 ? enc.encodeBuffer(l, right.subarray(i, i + block)) : enc.encodeBuffer(l);
    if (chunk.length) parts.push(new Uint8Array(chunk));
    onProgress?.(Math.round((i / left.length) * 100));
    await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
  }
  const end = enc.flush();
  if (end.length) parts.push(new Uint8Array(end));
  onProgress?.(100);
  const name = file.name.replace(/\.[^.]+$/, "") + ".mp3";
  return new File(parts, name, { type: "audio/mpeg" });
}
