import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Download, Check, ExternalLink, Gift } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { claimFreeDownload, type GateStep } from "@/lib/api/free-download.functions";

export function FreeDownloadGate({
  trackId,
  title,
  gate,
  remaining,
  signedIn,
  onUnlocked,
}: {
  trackId: string;
  title: string;
  gate: GateStep[];
  remaining: number | null;
  signedIn: boolean;
  onUnlocked: () => void;
}) {
  const claim = useServerFn(claimFreeDownload);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const key = `gate:${trackId}`;

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(key);
      if (v) setDone(JSON.parse(v));
    } catch { /* ignore */ }
  }, [key]);

  const mark = (i: number) => {
    const next = { ...done, [i]: true };
    setDone(next);
    try { window.localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const soldOut = remaining !== null && remaining <= 0;
  const allDone = gate.every((_, i) => done[i]);

  const unlock = async () => {
    setBusy(true);
    try {
      await claim({ data: { trackId } });
      toast.success("Unlocked! Your download is ready.");
      setOpen(false);
      onUnlocked();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not unlock");
    } finally {
      setBusy(false);
    }
  };

  if (soldOut) {
    return (
      <span className="inline-flex h-12 items-center rounded-full border border-border px-5 text-sm text-muted-foreground">
        Free downloads all claimed
      </span>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-105">
          <Gift className="h-4 w-4" />
          Free download{remaining !== null ? ` · ${remaining} left` : ""}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Unlock “{title}”</DialogTitle>
          <DialogDescription>
            {gate.length
              ? "Support the artist by completing each step below, then grab your free download."
              : "This track is free to download."}
          </DialogDescription>
        </DialogHeader>
        {!signedIn ? (
          <p className="text-sm">
            <Link to="/auth" className="font-semibold text-primary hover:underline">Sign in</Link> to get your free download.
          </p>
        ) : (
          <div className="space-y-3">
            {gate.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => mark(i)}
                className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition ${
                  done[i] ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${done[i] ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                  {done[i] ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{s.label}</span>
                  <span className="block text-xs capitalize text-muted-foreground">{s.platform}</span>
                </span>
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
              </a>
            ))}
            <button
              onClick={unlock}
              disabled={!allDone || busy}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {busy ? "Unlocking…" : allDone ? "Unlock download" : `Complete ${gate.filter((_, i) => !done[i]).length} more step(s)`}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
