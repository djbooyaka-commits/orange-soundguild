import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Upload, X, Music2, FileAudio, Image as ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useUploads } from "@/lib/uploads";
import { usePlayer } from "./player/PlayerContext";
import { useAuth } from "@/hooks/useAuth";
import { useAccountType } from "@/hooks/useAccountType";
import { toast } from "sonner";

const GENRES = ["Electronic", "House", "Tech House", "Drum and Bass", "Afro House", "Indie", "Lo-fi", "Ambient", "Jazz", "Techno", "Hip-hop", "Other"];

export function UploadDialog({ children }: { children: React.ReactNode }) {
  const { addUpload } = useUploads();
  const { play } = usePlayer();
  const { user } = useAuth();
  const { isFan } = useAccountType();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState(GENRES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setTitle("");
    setGenre(GENRES[0]);
    setFile(null);
    setCoverFile(null);
  };

  const onOpenChange = (o: boolean) => {
    if (o && !user) {
      navigate({ to: "/auth" });
      return;
    }
    if (o && isFan) {
      toast.error("Fan accounts can't upload. Upgrade to an artist account first.");
      return;
    }
    setOpen(o);
    if (!o) reset();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !file) return;
    setBusy(true);
    try {
      const track = await addUpload({ title: title.trim(), genre, file, coverFile });
      toast.success("Track published");
      setOpen(false);
      reset();
      play(track);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
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
            <Upload className="h-4 w-4 text-primary" /> Upload a track
          </DialogTitle>
          <DialogDescription>
            Share your sound with the soundwave community.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Track title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={80}
              placeholder="e.g. Midnight Drive"
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
              {GENRES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Audio file</label>
            <input
              ref={inputRef}
              type="file"
              accept="audio/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-md border border-dashed border-border bg-muted/40 p-3 text-left text-sm transition hover:border-primary hover:bg-muted"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <FileAudio className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                {file ? (
                  <>
                    <span className="block truncate font-medium text-foreground">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {(file.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block font-medium text-foreground">Choose an audio file</span>
                    <span className="text-xs text-muted-foreground">MP3, WAV, FLAC up to 50 MB</span>
                  </>
                )}
              </span>
              {file && (
                <span
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </span>
              )}
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Cover art (optional)</label>
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
                  <span className="block font-medium text-foreground">Choose cover image</span>
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
              disabled={!title.trim() || !file || busy}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Music2 className="h-4 w-4" /> {busy ? "Publishing…" : "Publish"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
