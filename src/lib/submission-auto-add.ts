import { PLATFORM_LABELS, type PlaylistPlatform } from "@/lib/playlist-platforms";

/**
 * Where an auto-approved submission goes when it is submitted.
 * - spotify: added to the curator's real Spotify playlist
 * - osg: added to the on-site Orange Sound Guild playlist
 * - manual: tracked in the room, but the curator adds it by hand on that service
 */
export type AutoAddTarget = "spotify" | "osg" | "manual";

export function autoAddTarget(platform: string | null | undefined): AutoAddTarget {
  const p = (platform || "spotify") as PlaylistPlatform;
  if (p === "spotify") return "spotify";
  if (p === "osg") return "osg";
  return "manual";
}

/** Note shown to the curator when a track must be added by hand. */
export function manualAddNote(platform: string | null | undefined): string {
  const label = PLATFORM_LABELS[(platform || "spotify") as PlaylistPlatform] ?? "streaming";
  return `Tracked in the room — add it by hand to your ${label} playlist, then press Added it myself.`;
}

/** Short message the submitter sees right after submitting. */
export function submitterAddMessage(opts: {
  added: boolean;
  playlistName: string;
  cost: number;
}): string {
  const spent = opts.cost === 0 ? "free pass used" : `${opts.cost} points spent`;
  return opts.added
    ? `Added to "${opts.playlistName}" — ${spent}`
    : `Submitted to "${opts.playlistName}" — ${spent}. The curator will add it to the playlist soon.`;
}
