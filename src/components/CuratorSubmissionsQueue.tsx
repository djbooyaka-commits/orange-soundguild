import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Inbox, Check, X, Loader2 } from "lucide-react";
import {
  listCuratorSubmissionsForMe,
  reviewCuratorSubmission,
} from "@/lib/api/curator-submissions.functions";
import { toast } from "sonner";

type Row = {
  id: string;
  playlist_name: string;
  submitter_username: string;
  spotify_track_url: string;
  spotify_track_name: string | null;
  cost_points: number;
  followed_all_artists: boolean;
  status: "pending" | "approved" | "rejected";
  curator_note: string | null;
  created_at: string;
};

export function CuratorSubmissionsQueue() {
  const listFn = useServerFn(listCuratorSubmissionsForMe);
  const reviewFn = useServerFn(reviewCuratorSubmission);
  const [rows, setRows] = useState<Row[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const refresh = async () => {
    const data = await listFn();
    setRows((data ?? []) as Row[]);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (id: string, approve: boolean) => {
    setBusyId(id);
    try {
      await reviewFn({ data: { id, approve, note: notes[id] } });
      toast.success(approve ? "Approved" : "Rejected");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusyId(null);
    }
  };

  const pending = rows.filter((r) => r.status === "pending");
  const past = rows.filter((r) => r.status !== "pending");

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Inbox className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold">Track submissions</h2>
          <p className="text-sm text-muted-foreground">
            Fans spent points earned on your playlists to submit these tracks. Approve to add them
            to your Spotify playlist yourself.
          </p>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          No pending submissions.
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {pending.map((s) => (
            <li key={s.id} className="rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <a
                    href={s.spotify_track_url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {s.spotify_track_name ?? s.spotify_track_url}
                  </a>
                  <p className="text-xs text-muted-foreground">
                    From @{s.submitter_username} → {s.playlist_name} · spent {s.cost_points} pts
                    {s.followed_all_artists ? " (follow bonus)" : ""}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  placeholder="Optional note to the submitter"
                  value={notes[s.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => act(s.id, true)}
                    disabled={busyId === s.id}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {busyId === s.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    Approve
                  </button>
                  <button
                    onClick={() => act(s.id, false)}
                    disabled={busyId === s.id}
                    className="inline-flex items-center gap-1 rounded-md bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            History ({past.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {past.slice(0, 20).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-2 text-xs"
              >
                <a
                  href={s.spotify_track_url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate hover:underline"
                >
                  {s.spotify_track_name ?? s.spotify_track_url}
                </a>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${
                    s.status === "approved"
                      ? "bg-emerald-500/15 text-emerald-500"
                      : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {s.status}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
