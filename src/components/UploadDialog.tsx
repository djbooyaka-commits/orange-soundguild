import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Upload, X, Music2, FileAudio, Image as ImageIcon, Disc3, GripVertical } from "lucide-react";
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

type Mode = "single" | "album";
type AlbumRow = { file: File; title: string };

function defaultTitleFromFile(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

export function UploadDialog({ children }: { children: React.ReactNode }) {
  const { addUpload, addAlbum, uploads } = useUploads();
  const { play } = usePlayer();
  const { user } = useAuth();
  const { isFan, isPioneer } = useAccountType();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("single");

  // Single-track state
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // Album state
  const [albumName, setAlbumName] = useState("");
  const [albumRows, setAlbumRows] = useState<AlbumRow[]>([]);

  // Shared
  const [genre, setGenre] = useState(GENRES[0]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const singleRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const PIONEER_LIMIT = 5;
  const remaining = PIONEER_LIMIT - uploads.length;

  const reset = () => {
    setMode("single");
    setTitle("");
    setFile(null);
    setAlbumName("");
    setAlbumRows([]);
    setGenre(GENRES[0]);
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
    if (o && isPioneer && remaining <= 0) {
      toast.error("Pioneer accounts are limited to 5 tracks. Upgrade to Artist to upload more.");
      return;
    }
    setOpen(o);
    if (!o) reset();
  };

  const addAlbumFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: AlbumRow[] = Array.from(files).map((f) => ({
      file: f,
      title: defaultTitleFromFile(f.name),
    }));
    setAlbumRows((prev) => [...prev, ...next]);
  };

  const moveAlbumRow = (idx: number, dir: -1 | 1) => {
    setAlbumRows((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = prev.slice();
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });
  };

  const removeAlbumRow = (idx: number) => {
    setAlbumRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateAlbumTitle = (idx: number, value: string) => {
    setAlbumRows((prev) => prev.map((r, i) => (i === idx ? { ...r, title: value } : r)));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "single") {
        if (!title.trim() || !file) return;
        const track = await addUpload({ title: title.trim(), genre, file, coverFile });
        toast.success("Track published");
        setOpen(false);
        reset();
        play(track);
      } else {
        if (!albumName.trim()) {
          toast.error("Album name is required.");
          return;
        }
        if (albumRows.length === 0) {
          toast.error("Add at least one track to the album.");
          return;
        }
        const created = await addAlbum({
          album: albumName.trim(),
          genre,
          coverFile,
          tracks: albumRows.map((r) => ({ title: r.title, file: r.file })),
        });
        toast.success(`Album published — ${created.length} track${created.length === 1 ? "" : "s"}`);
        setOpen(false);
        reset();
        if (created[0]) play(created[0]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const submitDisabled =
    busy ||
    (mode === "single" ? !title.trim() || !file : !albumName.trim() || albumRows.length === 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" /> Upload
          </DialogTitle>
          <DialogDescription>
            Share a single track or a full album with the community.
          </DialogDescription>
        </DialogHeader>

        {/* Mode switch */}
        <div className="inline-flex w-full rounded-md border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setMode("single")}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
              mode === "single"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Music2 className="h-3.5 w-3.5" /> Single track
          </button>
          <button
            type="button"
            onClick={() => setMode("album")}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${
              mode === "album"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Disc3 className="h-3.5 w-3.5" /> Album / EP
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === "single" ? (
            <>
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
                <label className="text-xs font-medium text-foreground">Audio file</label>
                <input
                  ref={singleRef}
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => singleRef.current?.click()}
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
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Album name</label>
                <input
                  value={albumName}
                  onChange={(e) => setAlbumName(e.target.value)}
                  required
                  maxLength={80}
                  placeholder="e.g. Nightwave EP"
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground">
                    Album tracks {albumRows.length > 0 && (
                      <span className="text-muted-foreground">({albumRows.length})</span>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={() => albumRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    <FileAudio className="h-3.5 w-3.5" /> Add files
                  </button>
                </div>
                <input
                  ref={albumRef}
                  type="file"
                  accept="audio/*"
                  multiple
                  onChange={(e) => { addAlbumFiles(e.target.files); if (albumRef.current) albumRef.current.value = ""; }}
                  className="hidden"
                />

                {albumRows.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => albumRef.current?.click()}
                    className="flex w-full items-center gap-3 rounded-md border border-dashed border-border bg-muted/40 p-3 text-left text-sm transition hover:border-primary hover:bg-muted"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Disc3 className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">Choose album tracks</span>
                      <span className="text-xs text-muted-foreground">Select multiple audio files at once</span>
                    </span>
                  </button>
                ) : (
                  <ul className="space-y-2">
                    {albumRows.map((row, idx) => (
                      <li
                        key={`${row.file.name}-${idx}`}
                        className="flex items-center gap-2 rounded-md border border-border bg-background p-2"
                      >
                        <div className="flex flex-col text-muted-foreground">
                          <button
                            type="button"
                            onClick={() => moveAlbumRow(idx, -1)}
                            disabled={idx === 0}
                            className="disabled:opacity-30"
                            aria-label="Move up"
                          >
                            <GripVertical className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-xs font-semibold text-primary">
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <input
                            value={row.title}
                            onChange={(e) => updateAlbumTitle(idx, e.target.value)}
                            maxLength={80}
                            className="h-8 w-full rounded border border-border bg-background px-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                          />
                          <div className="truncate text-[11px] text-muted-foreground">
                            {row.file.name} · {(row.file.size / (1024 * 1024)).toFixed(1)} MB
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => moveAlbumRow(idx, 1)}
                            disabled={idx === albumRows.length - 1}
                            className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                            aria-label="Move down"
                          >
                            ▾
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAlbumRow(idx)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Remove"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}

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
            <label className="text-xs font-medium text-foreground">
              {mode === "album" ? "Album cover (optional)" : "Cover art (optional)"}
            </label>
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
                  <span className="block font-medium text-foreground">
                    {mode === "album" ? "Choose album cover" : "Choose cover image"}
                  </span>
                )}
                {mode === "album" && (
                  <span className="block text-xs text-muted-foreground">Applied to every track in the album</span>
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
              disabled={submitDisabled}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mode === "album" ? <Disc3 className="h-4 w-4" /> : <Music2 className="h-4 w-4" />}
              {busy
                ? "Publishing…"
                : mode === "album"
                ? `Publish album${albumRows.length ? ` (${albumRows.length})` : ""}`
                : "Publish"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
