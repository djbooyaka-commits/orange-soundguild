import type { PlaylistPlatform } from "./playlist-platforms";

export function filterSubmissionPlaylists<T extends { platform?: string | null; genre?: string | null }>(
  playlists: T[],
  platform: "all" | PlaylistPlatform,
  genre = "All",
): T[] {
  return playlists.filter((playlist) =>
    (platform === "all" || (playlist.platform ?? "spotify") === platform) &&
    (genre === "All" || playlist.genre === genre),
  );
}

/** Most points first; playlists with no points always sit at the bottom. Ties keep name order. */
export function sortPlaylistsByPoints<T extends { name?: string | null }>(
  playlists: T[],
  pointsOf: (playlist: T) => number | null | undefined,
): T[] {
  return [...playlists].sort((a, b) => {
    const pa = Math.max(0, Number(pointsOf(a)) || 0);
    const pb = Math.max(0, Number(pointsOf(b)) || 0);
    if (pb !== pa) return pb - pa;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });
}

export function resolveSubmissionPlaylistId(playlists: Array<{ id: string }>, selectedId: string): string {
  return playlists.some((playlist) => playlist.id === selectedId) ? selectedId : (playlists[0]?.id ?? "");
}