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
  const names = [artist, ...(collaborators ?? []).map((c) => c.username)].filter(Boolean);
  return names.join(" & ");
}
