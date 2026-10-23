import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ListMusic, Plus, Trash2, Loader2, RefreshCw, Star, Clock } from "lucide-react";
import {
  addCuratorPlaylist,
  listMyCuratorPlaylists,
  removeCuratorPlaylist,
  getCuratorEarnedPoints,
  importMySpotifyCuratorPlaylists,
  setCuratorPlaylistHoldDays,
  setCuratorPlaylistDailyLimit,
} from "@/lib/api/curator.functions";
import { setCuratorPlaylistIsTeam } from "@/lib/api/curator-team.functions";
import { setCuratorPlaylistPool, setCuratorPlaylistGenre } from "@/lib/api/curator-submissions.functions";
import { PLAYLIST_GENRES } from "@/lib/playlist-genres";

type Playlist = {
  id: string;
  spotify_playlist_id: string;
  name: string;
  image_url: string | null;
  is_team?: boolean;
  accept_pool_submissions?: boolean;
  genre?: string | null;
  track_hold_days?: number | null;
  daily_submission_limit?: number | null;
};

export function CuratorPlaylistManager() {
  const addFn = useServerFn(addCuratorPlaylist);
  const listFn = useServerFn(listMyCuratorPlaylists);
  const removeFn = useServerFn(removeCuratorPlaylist);
  const earnedFn = useServerFn(getCuratorEarnedPoints);
  const importFn = useServerFn(importMySpotifyCuratorPlaylists);
  const setTeamFn = useServerFn(setCuratorPlaylistIsTeam);
  const setPoolFn = useServerFn(setCuratorPlaylistPool);
  const setHoldFn = useServerFn(setCuratorPlaylistHoldDays);
  const setLimitFn = useServerFn(setCuratorPlaylistDailyLimit);
  const setGenreFn = useServerFn(setCuratorPlaylistGenre);

  const [items, setItems] = useState<Playlist[]>([]);
  const [earned, setEarned] = useState(0);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [holdDrafts, setHoldDrafts] = useState<Record<string, string>>({});
  const [savingHoldId, setSavingHoldId] = useState<string | null>(null);
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});
  const [savingLimitId, setSavingLimitId] = useState<string | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const refresh = async () => {
    const [list, e] = await Promise.all([listFn(), earnedFn()]);
    setItems((list ?? []) as Playlist[]);
    setEarned(e.points);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncSpotifyPlaylists = async (silent = false) => {
    setSyncing(true);
    if (!silent) {
      setErr(null);
      setSyncMsg(null);
    }
    try {
      const result = await importFn();
      if (result.imported || result.updated) await refresh();
      const privateHint = result.needsReconnectForPrivate
        ? " Reconnect Spotify once to include private and collaborative playlists."
        : "";
      if (!silent || result.imported || result.updated) {
        setSyncMsg(
          result.imported
            ? `Added ${result.imported} Spotify playlist${result.imported === 1 ? "" : "s"} to the stream tracker.${privateHint}`
            : `Spotify playlists are synced.${privateHint}`,
        );
      }
    } catch (ex: any) {
      if (!silent) setErr(ex?.message ?? "Failed to sync Spotify playlists");
    } finally {
      setSyncing(false);
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await addFn({ data: { url } });
      setUrl("");
      await refresh();
    } catch (ex: any) {
      setErr(ex?.message ?? "Failed to add playlist");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await removeFn({ data: { id } });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const toggleTeam = async (p: Playlist) => {
    setTogglingId(p.id);
    try {
      await setTeamFn({ data: { playlistId: p.id, isTeam: !p.is_team } });
      await refresh();
    } catch (ex: any) {
      setErr(ex?.message ?? "Failed to update Team playlist");
    } finally {
      setTogglingId(null);
    }
  };

  const togglePool = async (p: Playlist) => {
    setTogglingId(p.id);
    try {
      await setPoolFn({ data: { playlistId: p.id, on: !p.accept_pool_submissions } });
      await refresh();
    } catch (ex: any) {
      setErr(ex?.message ?? "Failed to update");
    } finally {
      setTogglingId(null);
    }
  };

  const saveLimit = async (p: Playlist) => {
    const raw = limitDrafts[p.id] ?? String(p.daily_submission_limit ?? 3);
    const limit = Math.max(1, Math.min(6, Math.round(Number(raw) || 1)));
    setSavingLimitId(p.id);
    setErr(null);
    try {
      await setLimitFn({ data: { playlistId: p.id, limit } });
      setLimitDrafts((d) => ({ ...d, [p.id]: String(limit) }));
      await refresh();
    } catch (ex: any) {
      setErr(ex?.message ?? "Failed to save submission limit");
    } finally {
      setSavingLimitId(null);
    }
  };

  const saveHold = async (p: Playlist) => {
    const raw = holdDrafts[p.id] ?? String(p.track_hold_days ?? 30);
    const days = Math.max(0, Math.min(365, Math.round(Number(raw) || 0)));
    setSavingHoldId(p.id);
    setErr(null);
    try {
      await setHoldFn({ data: { playlistId: p.id, days } });
      setHoldDrafts((d) => ({ ...d, [p.id]: String(days) }));
      await refresh();
    } catch (ex: any) {
      setErr(ex?.message ?? "Failed to save hold days");
    } finally {
      setSavingHoldId(null);
    }
  };


  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ListMusic className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold">My Curator playlists</h2>
            <p className="text-sm text-muted-foreground">
              Add Spotify playlists to track streams from your followers.
            </p>
          </div>
        </div>
        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          Points earned: <span className="font-semibold">{earned}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => syncSpotifyPlaylists(false)}
          disabled={busy || syncing}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Sync Spotify playlists
        </button>
        {syncMsg && <p className="text-xs text-muted-foreground">{syncMsg}</p>}
      </div>

      <form onSubmit={add} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://open.spotify.com/playlist/..."
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add playlist
        </button>
      </form>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}

      <ul className="mt-4 space-y-2">
        {items.length === 0 && (
          <li className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No playlists yet. Connect Spotify or paste a playlist URL above.
          </li>
        )}
        {items.map((p) => (
          <li
            key={p.id}
            className={`flex flex-wrap items-center gap-2 rounded-md border p-3 ${p.is_team ? "border-primary/60 bg-primary/5" : "border-border"}`}
          >
            <div className="flex w-full basis-full items-center gap-3">
              {p.image_url ? (
                <img src={p.image_url} alt="" className="h-12 w-12 shrink-0 rounded object-cover"  loading="lazy" decoding="async" />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug break-words">
                  {p.name}
                  {p.is_team && (
                    <span className="ml-2 inline-flex shrink-0 align-middle items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      <Star className="h-3 w-3" /> Team playlist
                    </span>
                  )}
                </p>
                <a
                  href={`https://open.spotify.com/playlist/${p.spotify_playlist_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Open in Spotify ↗
                </a>
              </div>
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <label className="text-xs text-muted-foreground" htmlFor={`hold-${p.id}`}>
                Hold
              </label>
              <input
                id={`hold-${p.id}`}
                type="number"
                min={0}
                max={365}
                value={holdDrafts[p.id] ?? String(p.track_hold_days ?? 30)}
                onChange={(e) => setHoldDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                className="w-14 rounded border border-border bg-background px-1 py-0.5 text-xs"
                title="Days a track stays before it can be resubmitted"
              />
              <span className="text-xs text-muted-foreground">days</span>
              <button
                type="button"
                onClick={() => saveHold(p)}
                disabled={savingHoldId === p.id}
                className="ml-1 rounded border border-border px-2 py-0.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                {savingHoldId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </button>
            </div>
            <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
              <label className="text-xs text-muted-foreground" htmlFor={`dlimit-${p.id}`}>
                Submissions / 24h
              </label>
              <input
                id={`dlimit-${p.id}`}
                type="number"
                min={1}
                max={6}
                value={limitDrafts[p.id] ?? String(p.daily_submission_limit ?? 3)}
                onChange={(e) => setLimitDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                className="w-12 rounded border border-border bg-background px-1 py-0.5 text-xs"
                title="How many tracks each member can submit to this playlist every 24 hours (1-6)"
              />
              <button
                type="button"
                onClick={() => saveLimit(p)}
                disabled={savingLimitId === p.id}
                className="ml-1 rounded border border-border px-2 py-0.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                {savingLimitId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </button>
            </div>
            <select
              value={p.genre ?? ""}
              disabled={togglingId === p.id}
              aria-label="Playlist genre"
              onChange={async (e) => {
                setTogglingId(p.id);
                try {
                  await setGenreFn({ data: { playlistId: p.id, genre: e.target.value } });
                  await refresh();
                } catch (ex: any) {
                  setErr(ex?.message ?? "Failed to save genre");
                } finally {
                  setTogglingId(null);
                }
              }}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              <option value="">Genre…</option>
              {PLAYLIST_GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            {!p.is_team && (
              <button
                onClick={() => togglePool(p)}
                disabled={busy || togglingId === p.id}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50 ${p.accept_pool_submissions ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "border-border hover:bg-muted"}`}
                title="Show this playlist on the public Curator Playlists page so any artist can submit (Curator Pool)"
              >
                {p.accept_pool_submissions ? "In Curator Pool" : "Join Curator Pool"}
              </button>
            )}
            <button
              onClick={() => toggleTeam(p)}
              disabled={busy || togglingId === p.id}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50 ${p.is_team ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "border-border hover:bg-muted"}`}
              title={p.is_team ? "Unset as Team playlist" : "Mark as a Team playlist"}
            >
              {togglingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />}
              {p.is_team ? "Team" : "Set Team"}
            </button>
            <button
              onClick={() => remove(p.id)}
              disabled={busy}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
              aria-label="Remove playlist"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>

        ))}
      </ul>
    </div>
  );
}
