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
  setBetaRoomDailyLimit,
  getBetaRoomPoints,
  addBetaSubmissionToSpotify,
  cancelBetaSubmission,
  markBetaSubmissionAdded,
  getBetaSpotifyStatus,
  markAllBetaSubmissionsAdded,
  approveAllPendingBetaSubmissionsAdded,
} from "@/lib/api/beta-curator.functions";

type Playlist = { id: string; name: string; holdDays: number; isTeam?: boolean };
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
  reviewed_at?: string | null;
  added_to_spotify?: boolean;
  spotify_error?: string | null;
};

export function BetaRoomSubmissions({ roomId, isOwner }: { roomId: string; isOwner: boolean }) {
  const playlistsFn = useServerFn(listBetaRoomPlaylists);
  const pointsFn = useServerFn(getBetaRoomPoints);
  const mineFn = useServerFn(listMyBetaSubmissions);
  const queueFn = useServerFn(listBetaSubmissionsForOwner);
  const reviewFn = useServerFn(reviewBetaSubmission);
  const submitFn = useServerFn(submitBetaTrack);
  const setLimitFn = useServerFn(setBetaRoomDailyLimit);
  const addToSpotifyFn = useServerFn(addBetaSubmissionToSpotify);
  const cancelFn = useServerFn(cancelBetaSubmission);
  const markAddedFn = useServerFn(markBetaSubmissionAdded);
  const spotifyStatusFn = useServerFn(getBetaSpotifyStatus);
  const markAllFn = useServerFn(markAllBetaSubmissionsAdded);
  const approveAllFn = useServerFn(approveAllPendingBetaSubmissionsAdded);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [points, setPoints] = useState<{
    available: number;
    cost: number;
    dailyLimit: number;
    byPlaylist: Record<string, number>;
  }>({
    available: 0,
    cost: 50,
    dailyLimit: 2,
    byPlaylist: {},
  });
  const [mine, setMine] = useState<Submission[]>([]);
  const [queue, setQueue] = useState<Submission[]>([]);
  const [playlistId, setPlaylistId] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [limitDraft, setLimitDraft] = useState<string>("");
  const [savingLimit, setSavingLimit] = useState(false);
  const [spotifyConnected, setSpotifyConnected] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [pl, pts, my] = await Promise.all([
        playlistsFn({ data: { roomId } }) as Promise<Playlist[]>,
        pointsFn({ data: { roomId } }) as Promise<any>,
        mineFn({ data: { roomId } }) as Promise<Submission[]>,
      ]);
      setPlaylists((pl ?? []).filter((x) => !x.isTeam));
      setPoints({
        available: pts.available,
        cost: pts.cost,
        dailyLimit: pts.dailyLimit,
        byPlaylist: Object.fromEntries(
          (pts.byPlaylist ?? []).map((r: any) => [r.playlistId, r.available]),
        ),
      });
      setMine(my ?? []);
      const submittable = (pl ?? []).filter((x) => !x.isTeam);
      if (!playlistId && submittable[0]) setPlaylistId(submittable[0].id);
      if (isOwner) {
        const [q, sp] = await Promise.all([
          queueFn({ data: { roomId } }) as Promise<Submission[]>,
          spotifyStatusFn().catch(() => ({ connected: true })),
        ]);
        setQueue(q ?? []);
        setSpotifyConnected(!!sp?.connected);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistsFn, pointsFn, mineFn, queueFn, roomId, isOwner]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveLimit = async () => {
    const limit = Math.max(1, Math.min(6, Math.round(Number(limitDraft || points.dailyLimit) || 1)));
    setSavingLimit(true);
    try {
      await setLimitFn({ data: { roomId, limit } });
      setLimitDraft(String(limit));
      toast.success(`Members can now submit ${limit} track${limit === 1 ? "" : "s"} every 24 hours`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save the limit");
    } finally {
      setSavingLimit(false);
    }
  };

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

  const approveAllPending = async () => {
    if (!window.confirm("Mark every pending track as added to your playlist?")) return;
    setMarkingAll(true);
    try {
      const r: any = await approveAllFn({ data: { roomId } });
      toast.success(`${r.count} track${r.count === 1 ? "" : "s"} marked as added`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not mark tracks");
    } finally {
      setMarkingAll(false);
    }
  };

  const markAllAdded = async () => {
    if (!window.confirm("Mark every track in this list as added to your playlist?")) return;
    setMarkingAll(true);
    try {
      const r: any = await markAllFn({ data: { roomId } });
      toast.success(`${r.count} track${r.count === 1 ? "" : "s"} marked as added`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not mark tracks as added");
    } finally {
      setMarkingAll(false);
    }
  };

  const review = async (id: string, approve: boolean, manual = false) => {
    setBusyId(id);
    try {
      const r: any = await reviewFn({
        data: { submissionId: id, approve, note: notes[id], manual },
      });
      toast.success(approve ? (r.spotifyNote ?? "Approved") : "Rejected");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not review submission");
    } finally {
      setBusyId(null);
    }
  };

  const addApprovedToSpotify = async (id: string) => {
    setBusyId(id);
    try {
      const r: any = await addToSpotifyFn({ data: { submissionId: id } });
      toast.success(r?.spotifyNote ?? "Added to your Spotify playlist");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to add to Spotify");
    } finally {
      setBusyId(null);
    }
  };

  const markAdded = async (id: string) => {
    setBusyId(id);
    try {
      await markAddedFn({ data: { submissionId: id } });
      toast.success("Marked as added to your playlist");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not mark as added");
    } finally {
      setBusyId(null);
    }
  };

  const cancelSubmission = async (id: string) => {
    setBusyId(id);
    try {
      const r: any = await cancelFn({ data: { submissionId: id } });
      toast.success(`Submission cancelled — ${r.refunded} pts given back`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not cancel submission");
    } finally {
      setBusyId(null);
    }
  };

  const selectedPoints = points.byPlaylist[playlistId] ?? 0;
  const pending = queue.filter((q) => q.status === "pending");
  // Newest decision first, so a track you just approved is always at the top.
  const byReviewedDesc = (a: Submission, b: Submission) =>
    new Date(b.reviewed_at ?? b.created_at).getTime() -
    new Date(a.reviewed_at ?? a.created_at).getTime();
  const notAdded = queue
    .filter((q) => q.status === "approved" && !q.added_to_spotify)
    .sort(byReviewedDesc);
  const reviewed = queue
    .filter((q) => q.status === "rejected" || (q.status === "approved" && q.added_to_spotify))
    .sort(byReviewedDesc);

  return (
    <div className="space-y-6">
      {isOwner && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Inbox className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">Track submissions</h2>
              <p className="text-sm text-muted-foreground">
                Approving adds the track to your Spotify playlist (if Spotify is connected) and keeps
                it tracked. Submissions older than 15 days drop off this list.
              </p>
            </div>
            {!spotifyConnected && pending.length > 0 && (
              <button
                onClick={approveAllPending}
                disabled={markingAll}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-amber-500/60 px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-500/10 disabled:opacity-50"
              >
                {markingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Mark all as added ({pending.length})
              </button>
            )}
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
                        From @{s.submitter_username ?? "unknown"} → {s.playlist_name ?? "playlist"} ·
                        spent {s.cost_points} pts · sent{" "}
                        {new Date(s.created_at).toLocaleDateString()}
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
                        onClick={() => review(s.id, true, !spotifyConnected)}
                        disabled={busyId === s.id}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {busyId === s.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        {spotifyConnected ? "Approve" : "Added it myself"}
                      </button>
                      <button
                        onClick={() => review(s.id, false)}
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

          {notAdded.length > 0 && (
            <div className="mt-4 rounded-md border border-amber-500/50 bg-amber-500/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-amber-500">
                  Needs adding to your playlist ({notAdded.length})
                </h3>
                {notAdded.length > 1 && (
                  <button
                    onClick={markAllAdded}
                    disabled={markingAll}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-500/60 px-2 py-1 text-xs font-semibold text-amber-600 hover:bg-amber-500/10 disabled:opacity-50"
                  >
                    {markingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Mark all as added
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {spotifyConnected
                  ? "Newest approval first. Press Add to Spotify to try again, or Added it myself once the track is on your playlist."
                  : "Newest approval first. Press Added it myself once the track is on your playlist."}
              </p>
              <ul className="mt-2 space-y-2 text-xs">
                {notAdded.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-background p-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <a
                        href={s.spotify_track_url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate font-medium hover:underline"
                      >
                        {s.spotify_track_name ?? s.spotify_track_url}
                      </a>
                      <p className="truncate text-muted-foreground">
                        From @{s.submitter_username ?? "unknown"} → {s.playlist_name ?? "playlist"}
                        {s.reviewed_at
                          ? ` · approved ${new Date(s.reviewed_at).toLocaleString()}`
                          : ""}
                      </p>
                      {spotifyConnected && s.spotify_error ? (
                        <p className="mt-1 text-amber-600">{s.spotify_error}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {spotifyConnected && (
                      <button
                        onClick={() => addApprovedToSpotify(s.id)}
                        disabled={busyId === s.id}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-2 py-1 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {busyId === s.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Add to Spotify
                      </button>
                      )}
                      <button
                        onClick={() => markAdded(s.id)}
                        disabled={busyId === s.id}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                      >
                        Added it myself
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reviewed.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                History ({reviewed.length})
              </summary>
              <ul className="mt-2 space-y-2 text-xs">
                {reviewed.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <a
                        href={s.spotify_track_url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate hover:underline"
                      >
                        {s.spotify_track_name ?? s.spotify_track_url}
                      </a>
                      <p className="truncate text-muted-foreground">
                        From @{s.submitter_username ?? "unknown"} → {s.playlist_name ?? "playlist"}
                        {s.status === "approved" && s.reviewed_at
                          ? ` · added ${new Date(s.reviewed_at).toLocaleDateString()}`
                          : s.reviewed_at
                            ? ` · reviewed ${new Date(s.reviewed_at).toLocaleDateString()}`
                            : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ${
                          s.status === "approved"
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}


      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Submit a track</h2>
            <p className="text-sm text-muted-foreground">
              Spend {points.cost} points to submit 1 track. Max {points.dailyLimit} every 24 hours
              per playlist.
              Points are earned per playlist and can only be spent on the playlist you streamed.
              Submitting spends them right away. Team playlists aren&apos;t listed here — points
              can&apos;t be used on them.
            </p>
          </div>
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            Points here: <span className="font-semibold">{selectedPoints}</span>
          </div>
        </div>

        {isOwner && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
            <label className="text-xs text-muted-foreground" htmlFor="beta-daily-limit">
              Tracks a member can submit per playlist every 24 hours
            </label>
            <input
              id="beta-daily-limit"
              type="number"
              min={1}
              max={6}
              value={limitDraft || String(points.dailyLimit)}
              onChange={(e) => setLimitDraft(e.target.value)}
              className="w-14 rounded border border-border bg-background px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={saveLimit}
              disabled={savingLimit}
              className="rounded border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              Save
            </button>
            <span className="text-xs text-muted-foreground">1–6</span>
          </div>
        )}

        <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <select
            value={playlistId}
            onChange={(e) => setPlaylistId(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {playlists.length === 0 && <option value="">No playlists yet</option>}
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {points.byPlaylist[p.id] ?? 0} pts
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
            disabled={busy || !url.trim() || !playlistId || selectedPoints < points.cost}
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
                  Added to: {s.playlist_name ?? "Playlist"} · {s.cost_points} pts · sent{" "}
                  {new Date(s.created_at).toLocaleDateString()}
                  {s.reviewed_at
                    ? `${s.status === "approved" ? " · added " : " · reviewed "}${new Date(s.reviewed_at).toLocaleDateString()}`
                    : ""}
                  {s.curator_note ? ` · ${s.curator_note}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {s.status === "pending" && !(s as any).awaiting_add && (
                  <button
                    onClick={() => cancelSubmission(s.id)}
                    disabled={busyId === s.id}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {busyId === s.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    Cancel
                  </button>
                )}
                <span className="text-xs capitalize text-muted-foreground">{s.status}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
