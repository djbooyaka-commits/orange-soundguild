import { useEffect, useState } from "react";
import { toast } from "sonner";

/** "Remove all points" + reload-safe "Undo remove all" for a curator's room. */
export function RemoveAllPointsControls({
  removeAll,
  undo,
  last,
  onChanged,
}: {
  removeAll: () => Promise<{ batchId: string; members: number; points: number }>;
  undo: (batchId: string) => Promise<{ restored: number }>;
  last: () => Promise<{ batchId: string } | null>;
  onChanged: () => Promise<void> | void;
}) {
  const [batch, setBatch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    last().then((r) => setBatch(r?.batchId ?? null)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doRemove = async () => {
    if (!window.confirm("Remove ALL points from every member? You can undo this.")) return;
    setBusy(true);
    try {
      const r = await removeAll();
      setBatch(r.batchId);
      toast.success(`Removed ${r.points} pts from ${r.members} member(s)`);
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not remove points");
    } finally {
      setBusy(false);
    }
  };

  const doUndo = async () => {
    if (!batch) return;
    setBusy(true);
    try {
      await undo(batch);
      toast.success("Points given back");
      setBatch(null);
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not undo");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={doRemove}
        disabled={busy}
        className="rounded-md border border-destructive/50 px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
      >
        Remove all points
      </button>
      {batch && (
        <button
          type="button"
          onClick={doUndo}
          disabled={busy}
          className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          Undo remove all
        </button>
      )}
    </div>
  );
}
