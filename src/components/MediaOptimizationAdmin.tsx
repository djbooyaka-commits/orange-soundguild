import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, RefreshCw, Square, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  finalizeWavConversion,
  listWavTracks,
  prepareWavConversion,
} from "@/lib/api/media-optimize.functions";

type WavTrack = { id: string; title: string; artist: string; hasOriginal: boolean };
type RowState = { status: "idle" | "working" | "done" | "error"; note?: string };

export function MediaOptimizationAdmin() {
  const list = useServerFn(listWavTracks);
  const prepare = useServerFn(prepareWavConversion);
  const finalize = useServerFn(finalizeWavConversion);
  const [tracks, setTracks] = useState<WavTrack[] | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const { tracks } = await list();
      setTracks(tracks);
      setRows({});
    } catch (e) {
      toast.error((e as Error).message);
      setTracks([]);
    }
  }, [list]);

  useEffect(() => {
    void load();
  }, [load]);

  const setRow = (id: string, s: RowState) => setRows((r) => ({ ...r, [id]: s }));

  async function convertOne(t: WavTrack): Promise<boolean> {
    try {
      setRow(t.id, { status: "working", note: "Downloading WAV…" });
      const prep = await prepare({ data: { trackId: t.id } });
      const res = await fetch(prep.downloadUrl);
      if (!res.ok) throw new Error("Could not download the WAV");
      const blob = await res.blob();
      const wavFile = new File([blob], prep.wavPath.split("/").pop() ?? "track.wav", { type: "audio/wav" });

      const { convertToMp3 } = await import("@/lib/mp3-convert");
      const mp3 = await convertToMp3(wavFile, (p) => setRow(t.id, { status: "working", note: `Converting… ${p}%` }));

      setRow(t.id, { status: "working", note: "Uploading MP3…" });
      const { error: upErr } = await supabase.storage
        .from("audio")
        .uploadToSignedUrl(prep.mp3Path, prep.uploadToken, mp3, { contentType: "audio/mpeg" });
      if (upErr) throw new Error(upErr.message);

      await finalize({ data: { trackId: t.id, wavPath: prep.wavPath, mp3Path: prep.mp3Path } });
      const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
      setRow(t.id, { status: "done", note: `${mb(blob.size)} MB → ${mb(mp3.size)} MB` });
      return true;
    } catch (e) {
      setRow(t.id, { status: "error", note: (e as Error).message });
      return false;
    }
  }

  async function convertAll() {
    if (!tracks) return;
    stopRef.current = false;
    setRunning(true);
    let ok = 0;
    let failed = 0;
    for (const t of tracks) {
      if (stopRef.current) break;
      if (rows[t.id]?.status === "done") continue;
      if (await convertOne(t)) ok++;
      else failed++;
    }
    setRunning(false);
    toast.success(`Converted ${ok} track${ok === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}`);
  }

  async function convertSingle(t: WavTrack) {
    setRunning(true);
    const ok = await convertOne(t);
    setRunning(false);
    if (ok) toast.success(`"${t.title}" is now an MP3`);
  }

  const remaining = tracks?.filter((t) => rows[t.id]?.status !== "done").length ?? 0;

  return (
    <section className="rounded-2xl border border-border bg-card/50 p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Media optimization</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          {running ? (
            <button
              onClick={() => (stopRef.current = true)}
              className="inline-flex items-center gap-2 rounded-full border border-destructive px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10"
            >
              <Square className="h-4 w-4" /> Stop after this one
            </button>
          ) : (
            <button
              onClick={() => void convertAll()}
              disabled={!tracks || remaining === 0}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              Convert all to MP3 ({remaining})
            </button>
          )}
        </div>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Songs still streaming as large WAV files. Converting makes a 320 kbps MP3 for playback, which loads
        faster and uses far less bandwidth. The WAV is kept as the original-quality download for buyers
        (unless the song already has one). Keep this tab open while it runs.
      </p>

      {tracks === null ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : tracks.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No WAV songs left — everything streams as MP3.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {tracks.map((t) => {
            const r = rows[t.id];
            return (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    @{t.artist}
                    {t.hasOriginal ? " · has original download" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {r?.note && (
                    <span
                      className={
                        r.status === "error"
                          ? "text-xs text-destructive"
                          : r.status === "done"
                            ? "text-xs text-primary"
                            : "text-xs text-muted-foreground"
                      }
                    >
                      {r.status === "working" && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                      {r.status === "done" ? "Done · " : ""}
                      {r.note}
                    </span>
                  )}
                  {r?.status !== "done" && (
                    <button
                      onClick={() => void convertSingle(t)}
                      disabled={running}
                      className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-60"
                    >
                      Convert
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
