export type TrackCollaborator = {
  id: string;
  username: string;
};

export type Track = {
  id: string;
  title: string;
  artist: string;
  cover: string;
  src: string;
  durationLabel: string;
  uploadedAt: string;
  plays: number;
  genre: string;
  album?: string | null;
  trackNumber?: number | null;
  collaborators?: TrackCollaborator[];
};

export function formatArtistLine(artist: string, collaborators?: TrackCollaborator[]): string {
  const names = [artist, ...(collaborators ?? []).map((c) => c.username)]
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name, index, list) => list.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === index);
  return names.join(" & ");
}

export function getAlbumCollaborators(tracks: Track[]): TrackCollaborator[] {
  const seen = new Set<string>();
  const collaborators: TrackCollaborator[] = [];
  tracks.forEach((track) => {
    (track.collaborators ?? []).forEach((collaborator) => {
      const key = collaborator.id || collaborator.username.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      collaborators.push(collaborator);
    });
  });
  return collaborators;
}
