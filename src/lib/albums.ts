import type { Track } from "./tracks";

export type AlbumGroup = {
  key: string;
  album: string;
  artist: string;
  cover: string;
  genre: string;
  uploadedAt: string;
  tracks: Track[];
};

export type FeedItem =
  | { type: "track"; track: Track }
  | { type: "album"; album: AlbumGroup };

/**
 * Groups tracks by (artist, album). Tracks without an album name, or an album
 * containing only one track, are emitted as standalone tracks. Preserves the
 * original ordering by using the position of the first track in each group.
 */
export function groupFeed(tracks: Track[]): FeedItem[] {
  const groups = new Map<string, { firstIndex: number; tracks: Track[] }>();
  const singles: { index: number; track: Track }[] = [];

  tracks.forEach((t, index) => {
    const albumName = t.album?.trim();
    if (!albumName) {
      singles.push({ index, track: t });
      return;
    }
    const key = `${t.artist}::${albumName}`;
    const existing = groups.get(key);
    if (existing) existing.tracks.push(t);
    else groups.set(key, { firstIndex: index, tracks: [t] });
  });

  const items: { index: number; item: FeedItem }[] = [];

  groups.forEach((g, key) => {
    if (g.tracks.length < 2) {
      // Solo album track — treat as single
      items.push({ index: g.firstIndex, item: { type: "track", track: g.tracks[0] } });
      return;
    }
    const sorted = [...g.tracks].sort((a, b) => {
      const an = a.trackNumber ?? 999;
      const bn = b.trackNumber ?? 999;
      if (an !== bn) return an - bn;
      return a.title.localeCompare(b.title);
    });
    const first = sorted[0];
    items.push({
      index: g.firstIndex,
      item: {
        type: "album",
        album: {
          key,
          album: first.album!.trim(),
          artist: first.artist,
          cover: first.cover,
          genre: first.genre,
          uploadedAt: first.uploadedAt,
          tracks: sorted,
        },
      },
    });
  });

  singles.forEach(({ index, track }) => {
    items.push({ index, item: { type: "track", track } });
  });

  items.sort((a, b) => a.index - b.index);
  return items.map((i) => i.item);
}
