import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ExternalLink, ListMusic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  id: string;
  user_id: string;
  username: string | null;
  account_type: string | null;
  platform: string;
  playlist_url: string;
  track_url: string | null;
  note: string | null;
  status: string;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const PLATFORM_LABEL: Record<string, string> = {
  spotify: "Spotify",
  apple_music: "Apple Music",
  youtube: "YouTube",
  tidal: "Tidal",
};

export function PlaylistSubmissionsAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_playlist_submissions_admin");
    if (error) toast.error(error.message);
    setRows(((data ?? []) as Row[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, status: "approved" | "rejected") {
    setBusy(id);
    const { error } = await supabase.rpc("review_playlist_submission", {
      _id: id,
      _status: status,
      _note: notes[id]?.trim() || null,
    });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(status === "approved" ? "Marked approved" : "Marked rejected");
    void load();
  }

  const visible = filter === "pending" ? rows.filter((r) => r.status === "pending") : rows;

  return (
    <section className="rounded-2xl border border-border bg-card/50 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ListMusic className="h-5 w-5 text-primary" /> Playlist submissions
        </h2>
        <div className="flex gap-2">
          {(["pending", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                "rounded-full px-3 py-1 text-xs font-semibold capitalize transition " +
                (filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")
              }
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">No submissions here yet.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => (
            <li key={r.id} className="rounded-xl border border-border bg-background/60 p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                  {PLATFORM_LABEL[r.platform] ?? r.platform}
                </span>
                <span className="font-medium">@{r.username ?? "unknown"}</span>
                <span className="text-xs capitalize text-muted-foreground">{r.account_type}</span>
                <span
                  className={
                    "ml-auto rounded-full px-2 py-0.5 text-xs font-semibold capitalize " +
                    (r.status === "pending"
                      ? "bg-muted text-muted-foreground"
                      : r.status === "approved"
                        ? "bg-primary/15 text-primary"
                        : "bg-destructive/15 text-destructive")
                  }
                >
                  {r.status}
                </span>
              </div>

              <div className="mt-2 space-y-1 text-sm">
                <a
                  href={r.playlist_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 break-all text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> {r.playlist_url}
                </a>
                {r.track_url && (
                  <div>
                    <a
                      href={r.track_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 break-all text-muted-foreground hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> {r.track_url}
                    </a>
                  </div>
                )}
                {r.note && <p className="text-muted-foreground">{r.note}</p>}
                <p className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>

              {r.status === "pending" ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    placeholder="Note to artist (optional)"
                    value={notes[r.id] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={busy === r.id}
                      onClick={() => review(r.id, "approved")}
                      className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      disabled={busy === r.id}
                      onClick={() => review(r.id, "rejected")}
                      className="rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ) : (
                r.admin_note && (
                  <p className="mt-2 text-xs text-muted-foreground">Note: {r.admin_note}</p>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
