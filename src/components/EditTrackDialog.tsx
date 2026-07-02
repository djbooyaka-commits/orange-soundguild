import { useRef, useState } from "react";
import { Pencil, Image as ImageIcon, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useUploads } from "@/lib/uploads";
import type { Track } from "@/lib/tracks";
import { toast } from "sonner";

const GENRES = [
  "Electronic",
  "House",
  "Tech House",
  "Drum and Bass",
  "Afro House",
  "Indie",
  "Lo-fi",
  "Ambient",
  "Jazz",
  "Techno",
  "Hip-hop",
  "Other",
];

export function EditTrackDialog({
  track,
  children,
}: {
  track: Track;
  children: React.ReactNode;
}) {
  const { updateUpload } = useUploads();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(track.title);
  const [genre, setGenre] = useState(track.genre);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) {
      setTitle(track.title);
      setGenre(track.genre);
      setCoverFile(null);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await updateUpload({
        id: track.id,
        title: title.trim(),
        genre,
        coverFile,
      });
      toast.success("Track updated");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" /> Edit track
          </DialogTitle>
          <DialogDescription>Update the title, genre, or artwork.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Track title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={80}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Genre</label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            >
              {(GENRES.includes(genre) ? GENRES : [genre, ...GENRES]).map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">New cover art (optional)</label>
            <input
              ref={coverRef}
              type="file"
              accept="image/*"
              onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => coverRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-md border border-dashed border-border bg-muted/40 p-3 text-left text-sm transition hover:border-primary hover:bg-muted"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <ImageIcon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                {coverFile ? (
                  <span className="block truncate font-medium text-foreground">{coverFile.name}</span>
                ) : (
                  <span className="block font-medium text-foreground">Keep current artwork</span>
                )}
              </span>
              {coverFile && (
                <span
                  onClick={(e) => { e.stopPropagation(); setCoverFile(null); }}
                  className="rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </span>
              )}
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || busy}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
