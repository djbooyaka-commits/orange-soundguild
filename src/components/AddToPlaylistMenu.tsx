import { useState } from "react";
import { ListPlus, Plus, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useMyPlaylists } from "@/lib/playlists";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function AddToPlaylistMenu({
  trackId,
  trackTitle,
  variant = "overlay",
}: {
  trackId: string;
  trackTitle: string;
  variant?: "overlay" | "inline" | "player";
}) {
  const { user } = useAuth();
  const { playlists, create, addTrack } = useMyPlaylists();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const overlayClass =
    "absolute right-12 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-background/85 text-foreground backdrop-blur transition hover:bg-primary hover:text-primary-foreground";
  const inlineClass =
    "inline-flex h-12 items-center gap-2 rounded-full border border-border px-5 text-sm font-medium text-foreground transition hover:border-primary/40";
  const playerClass =
    "flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white";
  const triggerClass =
    variant === "inline" ? inlineClass : variant === "player" ? playerClass : overlayClass;

  const handleAdd = async (playlistId: string, playlistName: string) => {
    try {
      await addTrack(playlistId, trackId);
      toast.success(`Added "${trackTitle}" to ${playlistName}`);
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const n = name.trim();
    if (!n) return;
    try {
      const pl = await create(n);
      if (pl) {
        await addTrack(pl.id, trackId);
        toast.success(`Created "${pl.name}" and added "${trackTitle}"`);
      }
      setName("");
      setCreating(false);
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (!user) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          toast.message("Sign in to create playlists.");
        }}
        aria-label="Add to playlist"
        className={triggerClass}
      >
        <ListPlus className="h-4 w-4" />
        {variant === "inline" && <span>Add to playlist</span>}
      </button>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          aria-label="Add to playlist"
          className={triggerClass}
        >
          <ListPlus className="h-4 w-4" />
          {variant === "inline" && <span>Add to playlist</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Add to playlist</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {playlists.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No playlists yet.</div>
        )}
        {playlists.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => handleAdd(p.id, p.name)}>
            <Check className="mr-2 h-3.5 w-3.5 opacity-0" />
            <span className="truncate">{p.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {creating ? (
          <form onSubmit={handleCreate} className="flex items-center gap-1 px-2 py-1.5">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Playlist name"
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary"
            />
            <button
              type="submit"
              className="h-8 rounded-md bg-primary px-2 text-xs font-semibold text-primary-foreground"
            >
              Create
            </button>
          </form>
        ) : (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setCreating(true);
            }}
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            New playlist
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
