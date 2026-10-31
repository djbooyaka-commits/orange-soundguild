import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Send, Loader2, Music, Info, CheckCircle2, X } from "lucide-react";

import {
  listPlaylistsForSubmission,
  listMyTrackSubmissions,
  submitCuratorTrack,
  listPoolPlaylists,
} from "@/lib/api/curator-submissions.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resolveSubmissionPlaylistId } from "@/lib/playlist-submission-selection";
import { useAccountType } from "@/hooks/useAccountType";

export type SubmissionPlaylist = {
  id: string;
  curator_id?: string;
  curator_username: string;
  spotify_playlist_id: string;
  name: string;
  image_url: string | null;
  available_points?: number;
  daily_submission_limit?: number | null;
  genre?: string | null;
  platform?: string | null;
  external_url?: string | null;
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

export function SubmitTrackCard({ pool = false, playlistOptions, selectedPlaylistId, onPlaylistChange }: {
  pool?: boolean;
  playlistOptions?: SubmissionPlaylist[];
  selectedPlaylistId?: string;
  onPlaylistChange?: (id: string) => void;
} = {}) {
  const listJoined = useServerFn(listPlaylistsForSubmission);
  const listPool = useServerFn(listPoolPlaylists);
  const listPlaylists = pool ? listPool : listJoined;
  const listMine = useServerFn(listMyTrackSubmissions);
  const submitFn = useServerFn(submitCuratorTrack);

  const [playlists, setPlaylists] = useState<SubmissionPlaylist[]>([]);
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


  const TRACK_INPUT = {
    spotify: { label: "Spotify track URL", placeholder: "https://open.spotify.com/track/..." },
    youtube: { label: "YouTube track / video URL", placeholder: "https://www.youtube.com/watch?v=..." },
    tidal: { label: "Tidal track URL", placeholder: "https://tidal.com/browse/track/..." },
    apple_music: { label: "Apple Music track URL", placeholder: "https://music.apple.com/..." },
    osg: { label: "Orange Sound Guild track URL", placeholder: "https://orangesoundguild.com/t/..." },
  } as const;

  const [dailyPass, setDailyPass] = useState(false);
  const { accountType } = useAccountType();
  const isPioneer = accountType === "pioneer";

  const refresh = async () => {
    const [pl, m, dp] = await Promise.all([
      playlistOptions ?? listPlaylists(),
      listMine(),
      (supabase as any).rpc("artist_daily_pass_available"),
    ]);
    setDailyPass(Boolean(dp?.data));
    const sorted = [...(pl as SubmissionPlaylist[])].sort((a, b) => (b.available_points ?? 0) - (a.available_points ?? 0));
    setPlaylists(sorted);
    setMine((m ?? []) as Submission[]);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visiblePlaylists = playlistOptions ?? playlists;
  const activePlaylistId = resolveSubmissionPlaylistId(visiblePlaylists, selectedPlaylistId ?? playlistId);
  const selected = visiblePlaylists.find((p) => p.id === activePlaylistId);
  const recentCount = mine.filter(
    (s) =>
      Date.now() - new Date(s.created_at).getTime() < 24 * 60 * 60 * 1000 &&
      s.playlist_name === selected?.name,
  ).length;
  const dailyLimit = Math.max(1, Math.min(6, Number(selected?.daily_submission_limit ?? 3)));


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePlaylistId || !trackUrl.trim()) return;
    setBusy(true);
    try {
      const res = await submitFn({ data: { playlistId: activePlaylistId, trackUrl, pool } });
      toast.success(
        res.cost === 0
          ? "Submitted with your free daily 50-point artist pass"
          : `Submitted — ${res.cost} points spent`,
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
          <h2 className="font-semibold">{pool && selected ? `Submit to ${selected.name}` : "Submit a track"}</h2>
          <p className="text-sm text-muted-foreground">
            {pool ? "Send your track to this curator for review." : "Spend points earned from a Curator's playlist to suggest a Spotify track for that same playlist."}
          </p>
        </div>
      </div>

      {dailyPass && (
        <div className="mt-4 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm font-medium text-primary">
          {isPioneer
            ? "Pioneer Artist pass available — 1 free submission every 15 days."
            : "Daily 50-point artist pass available — your next submission today is free. Resets at 00:00 UTC."}
        </div>
      )}
      {!dailyPass && isPioneer && pool && (
        <div className="mt-4 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          Pioneer Artists get 1 free submission every 15 days. Your pass is used — upgrade to Artist for a free submission every day.
        </div>
      )}

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
                  {receipt.cost} pts
                </dd>
                <dt>Balance on this playlist</dt>
                <dd className="text-foreground font-semibold">{receipt.newBalance} pts</dd>
              </dl>
            </div>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => setReceipt(null)}
              className="rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="Dismiss receipt"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}


      {visiblePlaylists.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          {pool
            ? "No playlists match these filters."
            : "You aren't enrolled with any Curators yet. Open a Curator invite link to get started."}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label htmlFor="submission-playlist" className="block text-xs font-medium text-muted-foreground">Playlist</label>
          <select
            id="submission-playlist"
            value={activePlaylistId}
            onChange={(e) => { setPlaylistId(e.target.value); onPlaylistChange?.(e.target.value); }}
            className="w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm"
            disabled={busy}
          >
            {visiblePlaylists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — @{p.curator_username}
                {(p as any).track_hold_days ? ` · stays ${(p as any).track_hold_days} days` : ""}
                {pool ? "" : ` · ${p.available_points} pts`}
              </option>
            ))}
          </select>

          <label className="block text-xs font-medium text-muted-foreground">
            {TRACK_INPUT[(selected?.platform ?? "spotify") as keyof typeof TRACK_INPUT]?.label ?? TRACK_INPUT.spotify.label}
          </label>
          <input
            type="url"
            value={trackUrl}
            onChange={(e) => setTrackUrl(e.target.value)}
            placeholder={TRACK_INPUT[(selected?.platform ?? "spotify") as keyof typeof TRACK_INPUT]?.placeholder ?? TRACK_INPUT.spotify.placeholder}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            disabled={busy}
          />

          {!pool && (
          <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              Cost: <b>50 pts</b>. Max {dailyLimit} submission{dailyLimit === 1 ? "" : "s"} to this playlist every 24 hours (
              {recentCount}/{dailyLimit} used).
              {selected && (
                <>
                  {" "}
                  Available on this playlist: <b>{selected.available_points}</b> pts.
                </>
              )}{" "}
              O.S.G Artist playlists aren&apos;t listed here — those track changes are free on the{" "}
              <a href="/curator/osg-submit" className="underline">
                OSG submit page
              </a>
              .
            </div>
          </div>
          )}

          <Button
            type="submit"
            disabled={busy || !trackUrl.trim() || recentCount >= dailyLimit}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Submit for review
          </Button>
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
                    {s.playlist_name}{pool ? "" : ` · ${s.cost_points} pts`}
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
