import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Inbox, Loader2, Send, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  listBetaRoomPlaylists,
  listMyBetaSubmissions,
  listBetaSubmissionsForOwner,
  reviewBetaSubmission,
  submitBetaTrack,
  getBetaRoomPoints,
} from "@/lib/api/beta-curator.functions";

type Playlist = { id: string; name: string; holdDays: number };
type Submission = {
  id: string;
  playlist_id: string;
  playlist_name?: string | null;
  submitter_username?: string | null;
  spotify_track_url: string;
  spotify_track_name: string | null;
  cost_points: number;
  status: "pending" | "approved" | "rejected";
  curator_note: string | null;
  created_at: string;
};

export function BetaRoomSubmissions({ roomId, isOwner }: { roomId: string; isOwner: boolean }) {
  const playlistsFn = useServerFn(listBetaRoomPlaylists);
  const pointsFn = useServerFn(getBetaRoomPoints);
  const mineFn = useServerFn(listMyBetaSubmissions);
  const queueFn = useServerFn(listBetaSubmissionsForOwner);
  const reviewFn = useServerFn(reviewBetaSubmission);
  const submitFn = useServerFn(submitBetaTrack);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [points, setPoints] = useState<{ available: number; cost: number; dailyLimit: number }>({
    available: 0,
    cost: 50,
    dailyLimit: 2,
  });
  const [mine, setMine] = useState<Submission[]>([]);
  const [queue, setQueue] = useState<Submission[]>([]);
  const [playlistId, setPlaylistId] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [pl, pts, my] = await Promise.all([
        playlistsFn({ data: { roomId } }) as Promise<Playlist[]>,
        pointsFn({ data: { roomId } }) as Promise<any>,
        mineFn({ data: { roomId } }) as Promise<Submission[]>,
      ]);
      setPlaylists(pl ?? []);
      setPoints({ available: pts.available, cost: pts.cost, dailyLimit: pts.dailyLimit });
      setMine(my ?? []);
      if (!playlistId && pl?.[0]) setPlaylistId(pl[0].id);
      if (isOwner) {
        const q = (await queueFn({ data: { roomId } })) as Submission[];
        setQueue(q ?? []);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistsFn, pointsFn, mineFn, queueFn, roomId, isOwner]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistId || !url.trim()) return;
    setBusy(true);
    try {
      const r: any = await submitFn({ data: { roomId, playlistId, url } });
      toast.success(`Submitted — ${r.cost} points spent, ${r.remaining} left`);
      setUrl("");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not submit track");
    } finally {
      setBusy(false);
    }
  };

  const review = async (id: string, approve: boolean) => {
    setBusyId(id);
    try {
      const r: any = await reviewFn({ data: { submissionId: id, approve } });
      toast.success(approve ? (r.spotifyNote ?? "Approved") : "Rejected");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not review submission");
    } finally {
      setBusyId(null);
    }
  };

  const pending = queue.filter((q) => q.status === "pending");
  const reviewed = queue.filter((q) => q.status !== "pending");

  return (
    <div className="space-y-6">
      {isOwner && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Inbox className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">Track submissions</h2>
              <p className="text-sm text-muted-foreground">
                Approving adds the track to your Spotify playlist (if Spotify is connected) and keeps
                it tracked. Submissions older than 15 days drop off this list.
              </p>
            </div>
          </div>

          <ul className="mt-4 space-y-2">
            {pending.length === 0 && (
              <li className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No pending submissions.
              </li>
            )}
            {pending.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <a
                    href={s.spotify_track_url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-sm font-medium hover:text-primary"
                  >
                    {s.spotify_track_name ?? s.spotify_track_url}
                  </a>
                  <p className="text-xs text-muted-foreground">
                    @{s.submitter_username ?? "unknown"} · {s.playlist_name ?? "playlist"} ·{" "}
                    {s.cost_points} pts · {new Date(s.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => review(s.id, true)}
                  disabled={busyId === s.id}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {busyId === s.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  Approve
                </button>
                <button
                  onClick={() => review(s.id, false)}
                  disabled={busyId === s.id}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  <X className="h-3 w-3" /> Reject
                </button>
              </li>
            ))}
          </ul>

          {reviewed.length > 0 && (
            <>
              <h3 className="mt-6 text-sm font-semibold">Recently reviewed</h3>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {reviewed.slice(0, 10).map((s) => (
                  <li key={s.id} className="flex justify-between gap-3">
                    <span className="truncate">{s.spotify_track_name ?? s.spotify_track_url}</span>
                    <span className="shrink-0 capitalize">{s.status}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Submit a track</h2>
            <p className="text-sm text-muted-foreground">
              Spend {points.cost} points to submit 1 track. Max {points.dailyLimit} every 24 hours.
            </p>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            Points: <span className="font-semibold">{points.available}</span>
          </div>
        </div>

        <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select
            value={playlistId}
            onChange={(e) => setPlaylistId(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {playlists.length === 0 && <option value="">No playlists yet</option>}
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://open.spotify.com/track/..."
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy || !url.trim() || !playlistId || points.available < points.cost}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit
          </button>
        </form>

        <h3 className="mt-6 text-sm font-semibold">My submissions</h3>
        <ul className="mt-2 space-y-2">
          {mine.length === 0 && (
            <li className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              You haven&apos;t submitted anything in this room yet.
            </li>
          )}
          {mine.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
            >
              <div className="min-w-0">
                <a
                  href={s.spotify_track_url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm font-medium hover:text-primary"
                >
                  {s.spotify_track_name ?? s.spotify_track_url}
                </a>
                <p className="text-xs text-muted-foreground">
                  {s.cost_points} pts · {new Date(s.created_at).toLocaleDateString()}
                  {s.curator_note ? ` · ${s.curator_note}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs capitalize text-muted-foreground">{s.status}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
