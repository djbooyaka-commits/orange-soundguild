// Pure helpers for the admin "Media Optimization" WAV → MP3 tool.

export function isWavPath(path: string | null | undefined): boolean {
  return !!path && /\.wav(\?|$)/i.test(path);
}

/** New MP3 path in the track owner's folder, next to the original WAV. */
export function mp3PathFor(ownerId: string, wavPath: string, now: number): string {
  const file = wavPath.split("/").pop() ?? "track.wav";
  const base = file.replace(/\.wav(\?.*)?$/i, "").replace(/^\d{10,}-/, "") || "track";
  return `${ownerId}/${now}-${base}.mp3`;
}

/** The uploaded MP3 must sit in the owner's folder and be an .mp3 file. */
export function isValidMp3Target(ownerId: string, mp3Path: string): boolean {
  return (
    mp3Path.startsWith(`${ownerId}/`) &&
    /\.mp3$/i.test(mp3Path) &&
    !mp3Path.includes("..") &&
    mp3Path.split("/").length === 2
  );
}

/**
 * Columns to write after conversion. The MP3 becomes the streaming file; an
 * existing original-quality file is kept, otherwise the WAV becomes the
 * original so buyers can still download it.
 */
export function conversionPatch(
  wavPath: string,
  mp3Path: string,
  existingLossless: string | null,
): { audio_url: string; download_lossless_url: string } {
  return { audio_url: mp3Path, download_lossless_url: existingLossless || wavPath };
}
