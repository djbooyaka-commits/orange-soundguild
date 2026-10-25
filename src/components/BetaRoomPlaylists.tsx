import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ListMusic, ListPlus, Plus, Loader2, RefreshCw, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  listBetaRoomPlaylists,
  addBetaRoomPlaylist,
  syncBetaRoomPlaylist,
  removeBetaRoomPlaylist,
  setBetaPlaylistHoldDays,
  setBetaPlaylistTeam,
  setBetaPlaylistDailyLimit,
  setBetaPlaylistPool,
  setBetaPlaylistGenre,
  setBetaPlaylistTracklist,
} from "@/lib/api/beta-curator.functions";
import { syncOsgRoomPlaylist } from "@/lib/api/osg-room-streams.functions";
import { PLAYLIST_GENRES } from "@/lib/playlist-genres";
import {
  PLATFORM_LABELS,
  PLATFORM_SCROBBLE_TIPS,
  type PlaylistPlatform,
} from "@/lib/playlist-platforms";

type Playlist = {
  id: string;
  spotifyPlaylistId: string;
  platform?: PlaylistPlatform;
  externalUrl?: string | null;
  name: string;
  imageUrl: string | null;
  holdDays: number;
  dailyLimit: number | null;
  isTeam: boolean;
  inPool?: boolean;
  genre?: string | null;
  trackCount: number;
};

function playlistHref(p: Playlist) {
  return p.externalUrl || `https://open.spotify.com/playlist/${p.spotifyPlaylistId}`;
}

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
  const teamFn = useServerFn(setBetaPlaylistTeam);
  const poolFn = useServerFn(setBetaPlaylistPool);
  const limitFn = useServerFn(setBetaPlaylistDailyLimit);
  const genreFn = useServerFn(setBetaPlaylistGenre);
  const [limitDrafts, setLimitDrafts] = useState<Record<string, string>>({});
  const tracklistFn = useServerFn(setBetaPlaylistTracklist);
  const osgSyncFn = useServerFn(syncOsgRoomPlaylist);
  const [editId, setEditId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [listDraft, setListDraft] = useState("");

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
      if (r.platform && r.platform !== "spotify") {
        toast.success("Playlist added — now paste its tracklist");
        setEditId(r.id);
        setNameDraft("");
        setListDraft("");
      } else {
        toast.success(`Playlist added — tracking ${r.imported} track${r.imported === 1 ? "" : "s"}`);
      }
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

  const syncOsg = async (id: string) => {
    setBusyId(id);
    try {
      const r: any = await osgSyncFn({ data: { playlistId: id } });
      toast.success(`Synced ${r.imported} track${r.imported === 1 ? "" : "s"}`);
      await refresh();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not sync");
    } finally {
      setBusyId(null);
    }
  };

  const saveTracklist = async (id: string) => {
    setBusyId(id);
    try {
      const r: any = await tracklistFn({ data: { playlistId: id, name: nameDraft, text: listDraft } });
      toast.success(`Tracking ${r.imported} track${r.imported === 1 ? "" : "s"}`);
      setEditId(null);
      await refresh();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save tracklist");
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

  const saveLimit = async (p: Playlist) => {
    const n = Number(limitDrafts[p.id] ?? p.dailyLimit ?? 3);
    if (!Number.isFinite(n) || n < 1 || n > 6) {
      toast.error("Pick a number from 1 to 6");
      return;
    }
    setBusyId(p.id);
    try {
      await limitFn({ data: { playlistId: p.id, limit: n } });
      toast.success(`${p.name}: ${n} submission${n === 1 ? "" : "s"} per 24 hours`);
      setLimitDrafts((d) => {
        const { [p.id]: _, ...rest } = d;
        return rest;
      });
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save limit");
    } finally {
      setBusyId(null);
    }
  };

  const toggleTeam = async (p: Playlist) => {
    setBusyId(p.id);
    try {
      await teamFn({ data: { playlistId: p.id, isTeam: !p.isTeam } });
      toast.success(!p.isTeam ? "Marked as a team playlist" : "Team mark removed");
      await refresh();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update playlist");
    } finally {
      setBusyId(null);
    }
  };

  const togglePool = async (p: Playlist) => {
    setBusyId(p.id);
    try {
      await poolFn({ data: { playlistId: p.id, on: !p.inPool } });
      toast.success(!p.inPool ? "Joined the Curator Pool — artists can now submit from Curator Playlists" : "Left the Curator Pool");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update playlist");
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
              ? "Add playlists from Spotify, YouTube, Tidal, Apple Music or Orange Sound Guild. Every track is tracked through Last.fm scrobbles."
              : "Stream these playlists on their service — scrobbles matched via Last.fm earn points."}
          </p>
        </div>
      </div>

      {isOwner && (
        <form onSubmit={add} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Spotify, YouTube, Tidal, Apple Music or OSG playlist link"
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
            className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/50 p-3 sm:p-4"
          >
            <div className="flex w-full basis-full items-center gap-3">
              {p.imageUrl ? (
                <img src={p.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover"  loading="lazy" decoding="async" />
              ) : (
                <div className="h-12 w-12 shrink-0 rounded bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug break-words">
                  {p.name}
                  {p.isTeam && (
                    <span className="ml-2 inline-flex shrink-0 align-middle items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      Team
                    </span>
                  )}
                </p>
                <span className="mr-2 inline-flex rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {PLATFORM_LABELS[(p.platform ?? "spotify") as PlaylistPlatform]}
                </span>
                <a
                  href={playlistHref(p)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {p.trackCount} tracked track{p.trackCount === 1 ? "" : "s"} · Open in{" "}
                  {PLATFORM_LABELS[(p.platform ?? "spotify") as PlaylistPlatform]} ↗
                </a>
              </div>
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
                {!p.isTeam && (
                  <div className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1">
                    <label className="text-xs text-muted-foreground" htmlFor={`blimit-${p.id}`}>
                      Submissions / 24h
                    </label>
                    <input
                      id={`blimit-${p.id}`}
                      type="number"
                      min={1}
                      max={6}
                      placeholder="room"
                      value={limitDrafts[p.id] ?? (p.dailyLimit != null ? String(p.dailyLimit) : "")}
                      onChange={(e) => setLimitDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                      className="w-12 rounded border border-border bg-background px-1 py-0.5 text-xs"
                      title="How many tracks each member can submit to this playlist every 24 hours (1-6)"
                    />
                    <button
                      type="button"
                      onClick={() => saveLimit(p)}
                      disabled={busyId === p.id}
                      className="ml-1 rounded border border-border px-2 py-0.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                )}
                <label className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={p.isTeam}
                    onChange={() => toggleTeam(p)}
                    disabled={busyId === p.id}
                    className="h-3 w-3 accent-[hsl(var(--primary))]"
                  />
                  <span title="Team playlists can't be submitted to with points">Team</span>
                </label>
                <select
                  value={p.genre ?? ""}
                  disabled={busyId === p.id}
                  aria-label="Playlist genre"
                  onChange={async (e) => {
                    setBusyId(p.id);
                    try {
                      await genreFn({ data: { playlistId: p.id, genre: e.target.value } });
                      toast.success("Genre saved");
                      await refresh();
                    } catch (err: any) {
                      toast.error(err?.message ?? "Could not save genre");
                    } finally {
                      setBusyId(null);
                    }
                  }}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">Genre…</option>
                  {PLAYLIST_GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                {!p.isTeam && (
                  <button
                    onClick={() => togglePool(p)}
                    disabled={busyId === p.id}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50 ${p.inPool ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "border-border hover:bg-muted"}`}
                  >
                    {p.inPool ? "In Curator Pool" : "Join Curator Pool"}
                  </button>
                )}
                {(p.platform ?? "spotify") === "spotify" || p.platform === "osg" ? (
                  <button
                    onClick={() => (p.platform === "osg" ? syncOsg(p.id) : sync(p.id))}
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
                ) : (
                  <button
                    onClick={() => {
                      setEditId(editId === p.id ? null : p.id);
                      setNameDraft(p.name);
                      setListDraft("");
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    <ListPlus className="h-3 w-3" />
                    Edit tracklist
                  </button>
                )}
                <button
                  onClick={() => remove(p.id)}
                  disabled={busyId === p.id}
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                  aria-label="Remove playlist"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                {editId === p.id && (
                  <div className="w-full basis-full space-y-2 rounded-md border border-border bg-muted/30 p-3">
                    <input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      placeholder="Playlist name"
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                    <textarea
                      value={listDraft}
                      onChange={(e) => setListDraft(e.target.value)}
                      rows={8}
                      placeholder={"One track per line:\nArtist - Song\nArtist - Song"}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                      Saving replaces this playlist's tracked tracks. Scrobbles are matched by artist and song name.
                    </p>
                    <button
                      onClick={() => saveTracklist(p.id)}
                      disabled={busyId === p.id || !listDraft.trim()}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {busyId === p.id && <Loader2 className="h-3 w-3 animate-spin" />}
                      Save tracklist
                    </button>
                  </div>
                )}
              </>
            )}
            {!isOwner && (
              <p className="w-full basis-full text-[11px] text-muted-foreground">
                Scrobble tip: {PLATFORM_SCROBBLE_TIPS[(p.platform ?? "spotify") as PlaylistPlatform]}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
