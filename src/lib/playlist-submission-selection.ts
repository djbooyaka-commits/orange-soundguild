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

export function resolveSubmissionPlaylistId(playlists: Array<{ id: string }>, selectedId: string): string {
  return playlists.some((playlist) => playlist.id === selectedId) ? selectedId : (playlists[0]?.id ?? "");
}