import { useState } from "react";
import { Play, Pause, Heart, Trash2, Pencil, Tag } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { usePlayer } from "./player/PlayerContext";
import { useTrackLike } from "@/lib/likes";
import type { Track } from "@/lib/tracks";
import { AddToPlaylistMenu } from "./AddToPlaylistMenu";
import { EditTrackDialog } from "./EditTrackDialog";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ADMIN_GENRES = [
  "Electronic", "House", "Tech House", "Drum and Bass", "Afro House", "Afrobeats", "Amapiano",
  "Hip-Hop", "Indie", "Lo-fi", "Ambient", "Jazz", "Techno", "Psytrance", "POP", "Rock", "R&B", "Other",
];

export function TrackCard({ track, onDelete, canEdit }: { track: Track; onDelete?: (id: string) => void | Promise<void>; canEdit?: boolean }) {
  const { current, isPlaying, play, toggle } = usePlayer();
  const isAdmin = useIsAdmin();
  const [genre, setGenre] = useState(track.genre);
  const [genreOpen, setGenreOpen] = useState(false);
  const [genreBusy, setGenreBusy] = useState(false);

  const setAdminGenre = async (next: string) => {
    setGenreBusy(true);
    try {
      const { error } = await supabase.rpc("admin_set_track_genre", {
        _track_id: track.id,
        _genre: next,
      });
      if (error) throw error;
      setGenre(next);
      setGenreOpen(false);
      toast.success(`Genre set to ${next}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update genre");
    } finally {
      setGenreBusy(false);
    }
  };
  const navigate = useNavigate();
  const active = current?.id === track.id;
  const playing = active && isPlaying;
  const { liked, count, toggle: toggleLike } = useTrackLike(track.id);

  const onClick = () => {
    if (active) toggle();
    else play(track);
    navigate({ to: "/t/$trackId", params: { trackId: track.id } });
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete) return;
    if (!window.confirm(`Delete "${track.title}"? This cannot be undone.`)) return;
    await onDelete(track.id);
  };

  return (
    <article className="group overflow-hidden rounded-xl border border-border bg-card transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]">
      <div className="relative aspect-square overflow-hidden">
        <img
          src={track.cover}
          alt={`${track.title} cover`}
          loading="lazy"
          width={512}
          height={512}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
        <button
          onClick={onClick}
          aria-label={playing ? "Pause" : "Play"}
          className={`absolute bottom-3 right-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-glow)] transition md:transition ${
            active
              ? "opacity-100"
              : "opacity-100 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100"
          }`}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>

        <span className="absolute left-3 top-3 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-medium text-foreground backdrop-blur">
          {track.genre}
        </span>
        <AddToPlaylistMenu trackId={track.id} trackTitle={track.title} />
        {(onDelete || canEdit) && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5">
            {canEdit && (
              <EditTrackDialog track={track}>
                <button
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Edit track"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-background/85 text-foreground backdrop-blur transition hover:bg-primary hover:text-primary-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </EditTrackDialog>
            )}
            {onDelete && (
              <button
                onClick={handleDelete}
                aria-label="Delete track"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-background/85 text-foreground backdrop-blur transition hover:bg-destructive hover:text-destructive-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className={`truncate text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>
              {track.title}
            </h3>
            <div className="truncate text-xs text-muted-foreground">
              <Link
                to="/u/$handle"
                params={{ handle: track.artist }}
                onClick={(e) => e.stopPropagation()}
                className="hover:text-primary"
              >
                {track.artist}
              </Link>
              {(track.collaborators ?? []).map((c) => (
                <span key={c.id}>
                  {" & "}
                  <Link
                    to="/u/$handle"
                    params={{ handle: c.username }}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-primary"
                  >
                    {c.username}
                  </Link>
                </span>
              ))}
            </div>
          </div>
          <span className="shrink-0 text-[11px] text-muted-foreground">{track.uploadedAt}</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{track.plays.toLocaleString()} plays</span>
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleLike();
              }}
              aria-label={liked ? "Unlike" : "Like"}
              aria-pressed={liked}
              className={`flex items-center gap-1 transition ${liked ? "text-primary" : "hover:text-primary"}`}
            >
              <Heart className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} />
              <span className="tabular-nums">{count}</span>
            </button>
            <span>{track.durationLabel}</span>
          </div>
        </div>
        
      </div>

    </article>
  );
}
