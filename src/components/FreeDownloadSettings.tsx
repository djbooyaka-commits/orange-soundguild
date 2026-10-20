import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Gift, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { getFreeDownloadInfo, setFreeDownloadSettings, getMyDefaultGate, type GateStep } from "@/lib/api/free-download.functions";

const PLATFORMS = [
  { v: "osg", l: "Follow on Orange Sound Guild" },
  { v: "spotify", l: "Follow on Spotify" },
  { v: "youtube", l: "Subscribe on YouTube" },
  { v: "instagram", l: "Follow on Instagram" },
  { v: "tiktok", l: "Follow on TikTok" },
  { v: "facebook", l: "Follow on Facebook" },
  { v: "soundcloud", l: "Follow on SoundCloud" },
  { v: "custom", l: "Visit link" },
];

export function FreeDownloadSettings({ trackId, open }: { trackId: string; open: boolean }) {
  const load = useServerFn(getFreeDownloadInfo);
  const loadDefault = useServerFn(getMyDefaultGate);
  const save = useServerFn(setFreeDownloadSettings);
  const [enabled, setEnabled] = useState(false);
  const [limit, setLimit] = useState("");
  const [claimed, setClaimed] = useState(0);
  const [gate, setGate] = useState<GateStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [osgUrl, setOsgUrl] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPrefilled(false);
    Promise.all([load({ data: { trackId } }), loadDefault().catch(() => null)])
      .then(([r, d]) => {
        if (d) setOsgUrl(d.osgUrl);
        const osgStep = (url: string): GateStep => ({ platform: "osg", label: "Follow on Orange Sound Guild", url });
        const withOsg = (g: GateStep[]) =>
          d?.osgUrl && !g.some((s) => s.platform === "osg") ? [osgStep(d.osgUrl), ...g] : g;
        if (r && r.gate.length) {
          setEnabled(r.enabled);
          setLimit(r.limit != null ? String(r.limit) : "");
          setClaimed(r.claimed);
          setGate(r.gate);
          return;
        }
        setEnabled(r?.enabled ?? false);
        setClaimed(r?.claimed ?? 0);
        const base = d?.gate ?? [];
        setGate(withOsg(base));
        const lim = r?.limit ?? d?.limit ?? null;
        setLimit(lim != null ? String(lim) : "");
        if (base.length) setPrefilled(true);
      })
      .catch(() => {});
  }, [open, trackId, load, loadDefault]);

  const update = (i: number, patch: Partial<GateStep>) =>
    setGate((g) => g.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const onSave = async () => {
    setBusy(true);
    try {
      await save({
        data: { trackId, enabled, limit: limit.trim() ? Number(limit) : null, gate: gate.filter((s) => s.url.trim()) },
      });
      toast.success("Free download settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <label className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Gift className="h-4 w-4 text-primary" /> Free download (with download gate)
        </span>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
      </label>
      <p className="text-xs text-muted-foreground">
        Only works when the track has no price. Fans complete your steps, then download for free.
      </p>
      {enabled && (
        <>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              How many free downloads to give away (leave empty for unlimited) · {claimed} claimed
            </label>
            <input
              type="number"
              min="1"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="Unlimited"
              className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Steps fans must do first</span>
            {prefilled && (
              <p className="text-xs text-primary">Filled in from your last free download setup — just save.</p>
            )}
            {gate.map((s, i) => (
              <div key={i} className="flex flex-wrap gap-2 rounded-md border border-border p-2">
                <select
                  value={s.platform}
                  onChange={(e) => {
                    const p = PLATFORMS.find((x) => x.v === e.target.value);
                    update(i, {
                      platform: e.target.value,
                      label: p?.l ?? s.label,
                      ...(e.target.value === "osg" && osgUrl ? { url: osgUrl } : {}),
                    });
                  }}
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {PLATFORMS.map((p) => <option key={p.v} value={p.v}>{p.v}</option>)}
                </select>
                <input
                  value={s.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="Button text"
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                />
                <input
                  value={s.url}
                  onChange={(e) => update(i, { url: e.target.value })}
                  placeholder="https://…"
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                />
                <button type="button" onClick={() => setGate((g) => g.filter((_, j) => j !== i))} className="text-xs text-muted-foreground hover:text-destructive">
                  <X className="inline h-3 w-3" /> Remove
                </button>
              </div>
            ))}
            {gate.length < 8 && (
              <button
                type="button"
                onClick={() => setGate((g) => [...g, { platform: "spotify", label: "Follow on Spotify", url: "" }])}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Plus className="h-4 w-4" /> Add step
              </button>
            )}
          </div>
        </>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="h-9 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save free download settings"}
      </button>
    </div>
  );
}
