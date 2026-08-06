import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Loader2, Music, Info, CheckCircle2, X } from "lucide-react";

import {
  listPlaylistsForSubmission,
  listMyTrackSubmissions,
  submitCuratorTrack,
} from "@/lib/api/curator-submissions.functions";
import { toast } from "sonner";

type Playlist = {
  id: string;
  curator_id: string;
  curator_username: string;
  spotify_playlist_id: string;
  name: string;
  image_url: string | null;
  available_points: number;
};

type Submission = {
  id: string;
  playlist_name: string;
  spotify_track_url: string;
  spotify_track_name: string | null;
  cost_points: number;
  followed_all_artists: boolean;
  status: "pending" | "approved" | "rejected";
  curator_note: string | null;
  created_at: string;
};

export function SubmitTrackCard() {
  const listPlaylists = useServerFn(listPlaylistsForSubmission);
  const listMine = useServerFn(listMyTrackSubmissions);
  const submitFn = useServerFn(submitCuratorTrack);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [mine, setMine] = useState<Submission[]>([]);
  const [playlistId, setPlaylistId] = useState<string>("");
  const [trackUrl, setTrackUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{
    playlistName: string;
    trackName: string | null;
    cost: number;
    followedAll: boolean;
    newBalance: number;
  } | null>(null);


  const refresh = async () => {
    const [pl, m] = await Promise.all([listPlaylists(), listMine()]);
    const sorted = (pl as Playlist[]).sort((a, b) => b.available_points - a.available_points);
    setPlaylists(sorted);
    setMine((m ?? []) as Submission[]);
    if (!playlistId && sorted.length > 0) setPlaylistId(sorted[0].id);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = playlists.find((p) => p.id === playlistId);
  const recentCount = mine.filter(
    (s) =>
      Date.now() - new Date(s.created_at).getTime() < 24 * 60 * 60 * 1000 &&
      s.playlist_name === selected?.name,
  ).length;


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistId || !trackUrl.trim()) return;
    setBusy(true);
    try {
      const res = await submitFn({ data: { playlistId, trackUrl } });
      toast.success(
        `Submitted — ${res.cost} points spent${res.followedAll ? " (follow bonus applied)" : ""}`,
      );
      setReceipt({
        playlistName: res.playlistName,
        trackName: res.trackName,
        cost: res.cost,
        followedAll: res.followedAll,
        newBalance: res.newBalance,
      });
      setTrackUrl("");
      await refresh();
    } catch (ex: any) {
      toast.error(ex?.message ?? "Submission failed");
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Music className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold">Submit a track</h2>
          <p className="text-sm text-muted-foreground">
            Spend points earned from a Curator's playlist to suggest a Spotify track for that same
            playlist.
          </p>
        </div>
      </div>

      {receipt && (
        <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <div className="flex-1 text-sm">
              <div className="font-semibold text-emerald-500">Submission received</div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
                {receipt.trackName && (
                  <>
                    <dt>Track</dt>
                    <dd className="text-foreground">{receipt.trackName}</dd>
                  </>
                )}
                <dt>Paid from</dt>
                <dd className="text-foreground">{receipt.playlistName}</dd>
                <dt>Charged</dt>
                <dd className="text-foreground">
                  {receipt.cost} pts{receipt.followedAll ? " (follow bonus)" : ""}
                </dd>
                <dt>Balance on this playlist</dt>
                <dd className="text-foreground font-semibold">{receipt.newBalance} pts</dd>
              </dl>
            </div>
            <button
              type="button"
              onClick={() => setReceipt(null)}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="Dismiss receipt"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}


      {playlists.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          You aren't enrolled with any Curators yet. Open a Curator invite link to get started.
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-muted-foreground">Playlist</label>
          <select
            value={playlistId}
            onChange={(e) => setPlaylistId(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            disabled={busy}
          >
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — @{p.curator_username} · {p.available_points} pts
              </option>
            ))}
          </select>

          <label className="block text-xs font-medium text-muted-foreground">
            Spotify track URL
          </label>
          <input
            type="url"
            value={trackUrl}
            onChange={(e) => setTrackUrl(e.target.value)}
            placeholder="https://open.spotify.com/track/..."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            disabled={busy}
          />

          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              Cost: <b>50 pts</b>, or <b>45 pts</b> if you follow every artist on the playlist on
              Spotify. Max 5 submissions per playlist every 24 hours ({recentCount}/5 used on this playlist).
              {selected && (
                <>
                  {" "}
                  Available on this playlist: <b>{selected.available_points}</b> pts.
                </>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={busy || !trackUrl.trim() || recentCount >= 3}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit for review
          </button>
        </form>
      )}

      {mine.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold">My submissions</h3>
          <ul className="mt-2 space-y-2">
            {mine.slice(0, 10).map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
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
                  <p className="text-xs text-muted-foreground">
                    {s.playlist_name} · {s.cost_points} pts
                    {s.followed_all_artists ? " · follow bonus" : ""}
                  </p>
                  {s.curator_note && (
                    <p className="mt-1 text-xs italic text-muted-foreground">"{s.curator_note}"</p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    s.status === "approved"
                      ? "bg-emerald-500/15 text-emerald-500"
                      : s.status === "rejected"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
