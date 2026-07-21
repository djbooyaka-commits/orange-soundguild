import { Play, Pause, Disc3, Pencil } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { usePlayer } from "./player/PlayerContext";
import type { AlbumGroup } from "@/lib/albums";
import { formatArtistLine, getAlbumCollaborators } from "@/lib/tracks";

export function AlbumCard({
  album,
  canEdit = false,
  linkHandle,
}: {
  album: AlbumGroup;
  canEdit?: boolean;
  linkHandle?: string;
}) {
  const { current, isPlaying, play, toggle } = usePlayer();
  const navigate = useNavigate();
  const active = album.tracks.some((t) => t.id === current?.id);
  const playing = active && isPlaying;
  const artistLine = formatArtistLine(album.artist, getAlbumCollaborators(album.tracks));
  const albumHandle = linkHandle ?? album.artist;

  const onPlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (active) {
      toggle();
      return;
    }
    play(album.tracks[0]);
  };

  const onEdit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate({
      to: "/album/$handle/$album",
      params: { handle: album.artist, album: album.album },
    });
  };

  return (
    <Link
      to="/album/$handle/$album"
      params={{ handle: albumHandle, album: album.album }}
      className="group block overflow-hidden rounded-xl border border-border bg-card transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]"
    >
      <div className="relative aspect-square overflow-hidden">
        <img
          src={album.cover}
          alt={`${album.album} album cover`}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <button
          onClick={onPlay}
          aria-label={playing ? "Pause album" : "Play album"}
          className={`absolute bottom-3 right-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-glow)] transition ${
            active
              ? "opacity-100"
              : "opacity-100 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100"
          }`}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-medium text-foreground backdrop-blur">
          <Disc3 className="h-3 w-3" /> Album · {album.tracks.length}
        </span>
        {canEdit && (
          <button
            onClick={onEdit}
            aria-label="Edit album tracks"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background/85 text-foreground backdrop-blur transition hover:bg-primary hover:text-primary-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className={`truncate text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>
              {album.album}
            </h3>
            <span className="truncate text-xs text-muted-foreground">{artistLine}</span>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">{album.uploadedAt}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {album.tracks.length} tracks · {album.genre}
        </div>
      </div>
    </Link>
  );
}
