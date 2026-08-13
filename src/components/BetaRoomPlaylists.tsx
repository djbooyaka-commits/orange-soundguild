import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ListMusic, Plus, Loader2, RefreshCw, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  listBetaRoomPlaylists,
  addBetaRoomPlaylist,
  syncBetaRoomPlaylist,
  removeBetaRoomPlaylist,
  setBetaPlaylistHoldDays,
} from "@/lib/api/beta-curator.functions";

type Playlist = {
  id: string;
  spotifyPlaylistId: string;
  name: string;
  imageUrl: string | null;
  holdDays: number;
  trackCount: number;
};

export function BetaRoomPlaylists({
  roomId,
  isOwner,
  onChanged,
}: {
  roomId: string;
  isOwner: boolean;
  onChanged?: () => void;
}) {
  const listFn = useServerFn(listBetaRoomPlaylists);
  const addFn = useServerFn(addBetaRoomPlaylist);
  const syncFn = useServerFn(syncBetaRoomPlaylist);
  const removeFn = useServerFn(removeBetaRoomPlaylist);
  const holdFn = useServerFn(setBetaPlaylistHoldDays);

  const [items, setItems] = useState<Playlist[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [holdDrafts, setHoldDrafts] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const rows = (await listFn({ data: { roomId } })) as Playlist[];
      setItems(rows ?? []);
    } catch {
      /* not a member yet */
    }
  }, [listFn, roomId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    try {
      const r: any = await addFn({ data: { roomId, url } });
      toast.success(`Playlist added — tracking ${r.imported} track${r.imported === 1 ? "" : "s"}`);
      setUrl("");
      await refresh();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add playlist");
    } finally {
      setBusy(false);
    }
  };

  const sync = async (id: string) => {
    setBusyId(id);
    try {
      const r: any = await syncFn({ data: { playlistId: id } });
      toast.success(`Synced — ${r.imported} track${r.imported === 1 ? "" : "s"} tracked`);
      await refresh();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await removeFn({ data: { playlistId: id } });
      await refresh();
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  };

  const saveHold = async (p: Playlist) => {
    const raw = holdDrafts[p.id] ?? String(p.holdDays);
    setBusyId(p.id);
    try {
      await holdFn({ data: { playlistId: p.id, days: Number(raw) || 0 } });
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save hold days");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ListMusic className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold">Curator playlists</h2>
          <p className="text-sm text-muted-foreground">
            {isOwner
              ? "Add the Spotify playlists you curate. Every track on them is tracked through Last.fm scrobbles."
              : "Stream these playlists on Spotify (any account) — scrobbles matched via Last.fm earn points."}
          </p>
        </div>
      </div>

      {isOwner && (
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
      )}

      <ul className="mt-4 space-y-2">
        {items.length === 0 && (
          <li className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No playlists yet.
          </li>
        )}
        {items.map((p) => (
          <li
            key={p.id}
            className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
          >
            {p.imageUrl ? (
              <img src={p.imageUrl} alt="" className="h-12 w-12 rounded object-cover"  loading="lazy" decoding="async" />
            ) : (
              <div className="h-12 w-12 rounded bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <a
                href={`https://open.spotify.com/playlist/${p.spotifyPlaylistId}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {p.trackCount} tracked track{p.trackCount === 1 ? "" : "s"} · Open in Spotify ↗
              </a>
            </div>

            {isOwner && (
              <>
                <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <label className="text-xs text-muted-foreground" htmlFor={`bhold-${p.id}`}>
                    Hold
                  </label>
                  <input
                    id={`bhold-${p.id}`}
                    type="number"
                    min={0}
                    max={365}
                    value={holdDrafts[p.id] ?? String(p.holdDays)}
                    onChange={(e) => setHoldDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                    className="w-14 rounded border border-border bg-background px-1 py-0.5 text-xs"
                    title="Days a track stays before it can be resubmitted"
                  />
                  <span className="text-xs text-muted-foreground">days</span>
                  <button
                    type="button"
                    onClick={() => saveHold(p)}
                    disabled={busyId === p.id}
                    className="ml-1 rounded border border-border px-2 py-0.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
                <button
                  onClick={() => sync(p.id)}
                  disabled={busyId === p.id}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
                >
                  {busyId === p.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Sync tracks
                </button>
                <button
                  onClick={() => remove(p.id)}
                  disabled={busyId === p.id}
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                  aria-label="Remove playlist"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
