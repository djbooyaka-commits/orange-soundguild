import { useEffect, useRef, useState } from "react";
import { Pencil, Image as ImageIcon, X, Music2, Ticket, Copy, Plus } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useAccountType } from "@/hooks/useAccountType";
import {
  listMyTrackCodes,
  generateTrackCodes,
} from "@/lib/api/track-sales.functions";

const GENRES = [
  "Electronic", "House", "Tech House", "Drum and Bass", "Afro House",
  "Indie", "Lo-fi", "Ambient", "Jazz", "Techno", "Hip-hop", "Other",
];

type CodeRow = {
  id: string;
  code: string;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
};

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
  const { isArtist, isPioneer } = useAccountType();
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [priceInput, setPriceInput] = useState<string>("");
  const [forSale, setForSale] = useState(false);
  const [losslessFile, setLosslessFile] = useState<File | null>(null);
  const [hasLossless, setHasLossless] = useState(false);
  const [busy, setBusy] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);
  const losslessRef = useRef<HTMLInputElement>(null);

  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [codeCount, setCodeCount] = useState<number>(10);
  const [codesLoading, setCodesLoading] = useState(false);
  const [codesBusy, setCodesBusy] = useState(false);

  const loadCodes = useServerFn(listMyTrackCodes);
  const genCodes = useServerFn(generateTrackCodes);

  const onOpenChange = async (o: boolean) => {
    setOpen(o);
    if (o) {
      setTitle(track.title);
      setGenre(track.genre);
      setCoverFile(null);
      setLosslessFile(null);
      setCodesLoading(true);

      const { data } = await supabase
        .from("tracks")
        .select("price_cents, download_lossless_url")
        .eq("id", track.id)
        .maybeSingle();
      const row = data as { price_cents: number | null; download_lossless_url: string | null } | null;
      if (row?.price_cents && row.price_cents >= 100) {
        setForSale(true);
        setPriceInput((row.price_cents / 100).toFixed(2));
      } else {
        setForSale(false);
        setPriceInput("");
      }
      setHasLossless(!!row?.download_lossless_url);

      try {
        const { codes: rows } = await loadCodes({ data: { trackId: track.id } });
        setCodes(rows);
      } catch {
        setCodes([]);
      } finally {
        setCodesLoading(false);
      }
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    let priceCents: number | null | undefined = undefined;
    if (forSale) {
      const p = Math.round(Number(priceInput) * 100);
      if (!Number.isFinite(p) || p < 100) {
        toast.error("Price must be at least $1.00");
        return;
      }
      priceCents = p;
    } else {
      priceCents = null;
    }
    setBusy(true);
    try {
      await updateUpload({
        id: track.id,
        title: title.trim(),
        genre,
        coverFile,
        priceCents,
        losslessFile,
      });
      toast.success("Track updated");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const unclaimed = codes.filter((c) => !c.claimed_by);
  const claimed = codes.length - unclaimed.length;
  const remaining = 100 - codes.length;

  const doGenerate = async () => {
    const n = Math.max(1, Math.min(remaining, Math.floor(codeCount)));
    if (n < 1) return;
    setCodesBusy(true);
    try {
      await genCodes({ data: { trackId: track.id, count: n } });
      const { codes: rows } = await loadCodes({ data: { trackId: track.id } });
      setCodes(rows);
      toast.success(`${n} code${n > 1 ? "s" : ""} generated`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate codes");
    } finally {
      setCodesBusy(false);
    }
  };

  const copyAll = () => {
    const text = unclaimed.map((c) => c.code).join("\n");
    if (!text) return;
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(`${unclaimed.length} code${unclaimed.length > 1 ? "s" : ""} copied`))
      .catch(() => toast.error("Copy failed"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" /> Edit track
          </DialogTitle>
          <DialogDescription>Update details, set a price, or give away free download codes.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5">
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

          {/* Sell this track */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Music2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Sell this track</span>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={forSale}
                  onChange={(e) => setForSale(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-xs text-muted-foreground">For sale</span>
              </label>
            </div>

            {forSale && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Price (USD, min $1.00)</label>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-muted-foreground">$</span>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                      placeholder="1.99"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Lossless download (WAV/FLAC, optional {hasLossless ? "— already uploaded" : ""})
                  </label>
                  <input
                    ref={losslessRef}
                    type="file"
                    accept="audio/wav,audio/flac,audio/x-flac,audio/x-wav,.wav,.flac"
                    onChange={(e) => setLosslessFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => losslessRef.current?.click()}
                    className="mt-1 flex w-full items-center gap-3 rounded-md border border-dashed border-border bg-background/60 p-3 text-left text-sm transition hover:border-primary"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Music2 className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      {losslessFile ? (
                        <span className="block truncate font-medium text-foreground">{losslessFile.name}</span>
                      ) : hasLossless ? (
                        <span className="block text-muted-foreground">Replace lossless file</span>
                      ) : (
                        <span className="block text-muted-foreground">Upload WAV/FLAC</span>
                      )}
                    </span>
                    {losslessFile && (
                      <span
                        onClick={(e) => { e.stopPropagation(); setLosslessFile(null); }}
                        className="rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Buyers get this file if provided. Otherwise they download the standard audio.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Free download codes */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ticket className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Free download codes</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {codesLoading ? "…" : `${codes.length}/100 · ${claimed} claimed`}
              </span>
            </div>

            {remaining > 0 && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium text-muted-foreground">Generate</label>
                  <input
                    type="number"
                    min={1}
                    max={remaining}
                    value={codeCount}
                    onChange={(e) => setCodeCount(Number(e.target.value))}
                    className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                  />
                </div>
                <button
                  type="button"
                  disabled={codesBusy}
                  onClick={doGenerate}
                  className="inline-flex h-10 items-center gap-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-105 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Codes
                </button>
              </div>
            )}
            {remaining === 0 && (
              <p className="text-xs text-muted-foreground">You've reached the 100-code cap for this track.</p>
            )}

            {unclaimed.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {unclaimed.length} available
                  </span>
                  <button
                    type="button"
                    onClick={copyAll}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <Copy className="h-3 w-3" /> Copy all
                  </button>
                </div>
                <div className="max-h-32 overflow-auto rounded-md border border-border bg-background p-2 font-mono text-xs">
                  {unclaimed.map((c) => (
                    <div key={c.id} className="py-0.5">{c.code}</div>
                  ))}
                </div>
              </div>
            )}
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
