import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ListMusic, Plus, Trash2, Loader2, RefreshCw } from "lucide-react";
import {
  addCuratorPlaylist,
  listMyCuratorPlaylists,
  removeCuratorPlaylist,
  getCuratorEarnedPoints,
  importMySpotifyCuratorPlaylists,
} from "@/lib/api/curator.functions";

type Playlist = {
  id: string;
  spotify_playlist_id: string;
  name: string;
  image_url: string | null;
};

export function CuratorPlaylistManager() {
  const addFn = useServerFn(addCuratorPlaylist);
  const listFn = useServerFn(listMyCuratorPlaylists);
  const removeFn = useServerFn(removeCuratorPlaylist);
  const earnedFn = useServerFn(getCuratorEarnedPoints);
  const importFn = useServerFn(importMySpotifyCuratorPlaylists);

  const [items, setItems] = useState<Playlist[]>([]);
  const [earned, setEarned] = useState(0);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
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
            className="flex items-center gap-3 rounded-md border border-border p-3"
          >
            {p.image_url ? (
              <img src={p.image_url} alt="" className="h-12 w-12 rounded object-cover" />
            ) : (
              <div className="h-12 w-12 rounded bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <a
                href={`https://open.spotify.com/playlist/${p.spotify_playlist_id}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Open in Spotify ↗
              </a>
            </div>
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
