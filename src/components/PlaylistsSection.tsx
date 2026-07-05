import { useState } from "react";
import { Play, Pause, Trash2, ChevronDown, ChevronUp, ListMusic, Plus, ArrowUp, ArrowDown, BookmarkPlus } from "lucide-react";
import { usePlaylistsForUser, savePlaylistToLibrary } from "@/lib/playlists";
import { usePlayer } from "./player/PlayerContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function PlaylistsSection({ userId, isOwner }: { userId: string | null; isOwner: boolean }) {
  const { playlists, removeTrack, deletePlaylist, createPlaylist, moveTrack } = usePlaylistsForUser(userId);
  const { current, isPlaying, play, toggle } = usePlayer();
  const { user } = useAuth();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [name, setName] = useState("");

  const handleSave = async (id: string, plName: string) => {
    if (!user) {
      toast.error("Sign in to save playlists.");
      return;
    }
    setSavingId(id);
    try {
      await savePlaylistToLibrary(id, user.id, plName);
      toast.success(`Saved "${plName}" to your library`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingId(null);
    }
  };

  if (!userId) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    try {
      await createPlaylist(n);
      toast.success(`Created "${n}"`);
      setName("");
      setCreating(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const createBar = isOwner ? (
    <div className="mb-4">
      {creating ? (
        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Playlist name"
            className="h-10 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            className="h-10 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setName("");
            }}
            className="h-10 rounded-full border border-border bg-background px-4 text-sm font-semibold"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-105"
        >
          <Plus className="h-4 w-4" /> New playlist
        </button>
      )}
    </div>
  ) : null;

  if (playlists.length === 0) {
    return isOwner ? (
      <div className="space-y-4">
        {createBar}
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No playlists yet. Create one above, or tap the playlist icon on any track to start one.
        </div>
      </div>
    ) : null;
  }

  return (
    <div className="space-y-4">
      {createBar}
      {playlists.map((pl) => {
        const open = openId === pl.id;
        const plActive = pl.tracks.some((t) => t.id === current?.id);
        const plPlaying = plActive && isPlaying;
        return (
          <div key={pl.id} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 p-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (pl.tracks.length === 0) return;
                  if (plActive) toggle();
                  else play(pl.tracks[0], pl.tracks);
                }}
                aria-label={plPlaying ? "Pause playlist" : "Play playlist"}
                disabled={pl.tracks.length === 0}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow disabled:opacity-40"
              >
                {plPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
              </button>
              <button
                onClick={() => setOpenId(open ? null : pl.id)}
                className="flex flex-1 items-center gap-3 text-left"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <ListMusic className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold">{pl.name}</h3>
                  <p className="text-xs text-muted-foreground">{pl.tracks.length} tracks</p>
                </div>
                {open ? <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" /> : <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />}
              </button>
              {isOwner ? (
                <button
                  onClick={() => {
                    if (window.confirm(`Delete playlist "${pl.name}"?`)) void deletePlaylist(pl.id);
                  }}
                  aria-label="Delete playlist"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-destructive hover:text-destructive-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={() => void handleSave(pl.id, pl.name)}
                  disabled={savingId === pl.id || pl.tracks.length === 0}
                  aria-label="Save playlist to your library"
                  title="Save to your library"
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  {savingId === pl.id ? "Saving…" : "Save"}
                </button>
              )}
            </div>
            {open && (
              <ul className="divide-y divide-border border-t border-border">
                {pl.tracks.length === 0 ? (
                  <li className="px-4 py-3 text-xs text-muted-foreground">Empty playlist.</li>
                ) : (
                  pl.tracks.map((t, idx) => {
                    const active = current?.id === t.id;
                    const playing = active && isPlaying;
                    return (
                      <li key={t.id} className="flex items-center gap-2 px-4 py-2">
                        <button
                          onClick={() => (active ? toggle() : play(t, pl.tracks))}
                          aria-label={playing ? "Pause" : "Play"}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
                        >
                          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
                        </button>
                        <img src={t.cover} alt="" className="h-8 w-8 rounded object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm ${active ? "text-primary" : ""}`}>{t.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{t.artist}</p>
                        </div>
                        {isOwner && (
                          <>
                            <button
                              onClick={() => void moveTrack(pl.id, t.id, "up")}
                              disabled={idx === 0}
                              aria-label="Move up"
                              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => void moveTrack(pl.id, t.id, "down")}
                              disabled={idx === pl.tracks.length - 1}
                              aria-label="Move down"
                              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-30"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => void removeTrack(pl.id, t.id)}
                              aria-label="Remove from playlist"
                              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
