import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, FlaskConical, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  getBetaRoom,
  addBetaRoomTrack,
  removeBetaRoomTrack,
  syncBetaRoom,
  joinBetaRoom,
} from "@/lib/api/beta-rooms.functions";
import { syncLastfmBetaRoom } from "@/lib/api/lastfm.functions";
import { SpotifyConnectCard } from "@/components/SpotifyConnectCard";
import { LastfmConnectCard } from "@/components/LastfmConnectCard";

export const Route = createFileRoute("/beta-rooms/$roomId")({
  head: () => ({
    meta: [
      { title: "Beta Room — Orange Sound Guild" },
      { name: "description", content: "Experimental stream tracking room." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Beta Room — Orange Sound Guild" },
      { property: "og:description", content: "Experimental stream tracking room." },
    ],
  }),
  component: BetaRoomDetail,
});

type RoomData = Awaited<ReturnType<typeof getBetaRoom>>;

function BetaRoomDetail() {
  const { roomId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const getFn = useServerFn(getBetaRoom);
  const addFn = useServerFn(addBetaRoomTrack);
  const removeFn = useServerFn(removeBetaRoomTrack);
  const syncFn = useServerFn(syncBetaRoom);
  const syncLastfmFn = useServerFn(syncLastfmBetaRoom);
  const joinFn = useServerFn(joinBetaRoom);

  const [room, setRoom] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyLastfm, setBusyLastfm] = useState(false);
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [lastfmMsg, setLastfmMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getFn({ data: { roomId } });
      setRoom(data);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load room");
    } finally {
      setLoading(false);
    }
  }, [getFn, roomId]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [user, refresh]);

  const addTrack = async () => {
    setBusy(true);
    try {
      await addFn({ data: { roomId, url } });
      setUrl("");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add track");
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r: any = await syncFn({ data: { roomId } });
      if (!r.connected) {
        setMsg("Connect Spotify below first, then sync.");
      } else if (r.error === "spotify_account_not_allowed") {
        setMsg(
          "Spotify blocked the read: this account isn't on the app's allowed-user list yet. Once the site's Spotify app gets Extended Quota (free, via Spotify Developer Dashboard), this cap disappears. For now, connect your own Spotify app below to skip the cap.",
        );
      } else if (r.error) {
        setMsg(`Spotify error: ${r.error}`);
      } else if (r.added) {
        setMsg(`+${r.added} beta point${r.added === 1 ? "" : "s"} (scanned ${r.scanned} plays)`);
      } else {
        setMsg(
          `Up to date — scanned ${r.scanned} recent play${r.scanned === 1 ? "" : "s"}, ${r.matched} matched the ${r.watching}-track watch list.`,
        );
      }
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    try {
      await joinFn({ data: { roomId } });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || loading) {
    return <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>;
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-muted-foreground">
          Please <Link to="/auth" className="text-primary underline">sign in</Link>.
        </p>
      </main>
    );
  }

  if (!room) {
    return <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">Room not found.</main>;
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 pb-40">
      <Link
        to="/beta-rooms"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> All beta rooms
      </Link>

      <header className="mb-6 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FlaskConical className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{room.name}</h1>
          {room.description && <p className="text-sm text-muted-foreground">{room.description}</p>}
        </div>
      </header>

      {!room.joined ? (
        <button
          onClick={join}
          disabled={busy}
          className="mb-6 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Join this room
        </button>
      ) : (
        <section className="mb-6 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              Your beta points: <span className="font-semibold">{room.myPoints}</span>
            </div>
            <button
              onClick={sync}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync recently played
            </button>
          </div>
          {msg && <p className="mt-3 text-xs text-muted-foreground">{msg}</p>}
        </section>
      )}

      <section className="mb-6 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Watch list ({room.tracks.length})</h2>
        <p className="text-xs text-muted-foreground">
          Plays of these tracks earn a point, no matter where they were played from.
        </p>

        {room.isOwner && (
          <div className="mt-3 flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://open.spotify.com/track/…"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={addTrack}
              disabled={busy || !url.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        )}

        <ul className="mt-4 space-y-2">
          {room.tracks.length === 0 && (
            <li className="text-sm text-muted-foreground">No tracks yet.</li>
          )}
          {room.tracks.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <a
                  href={`https://open.spotify.com/track/${t.spotifyTrackId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm font-medium hover:text-primary"
                >
                  {t.name ?? t.spotifyTrackId}
                </a>
                {t.artist && <p className="text-xs text-muted-foreground">{t.artist}</p>}
              </div>
              {room.isOwner && (
                <button
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await removeFn({ data: { roomId, trackRowId: t.id } });
                      await refresh();
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  aria-label="Remove track"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {room.isOwner && room.leaderboard.length > 0 && (
        <section className="mb-6 rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Leaderboard</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {room.leaderboard.map((l) => (
              <li key={l.userId} className="flex justify-between">
                <span>@{l.username ?? l.userId.slice(0, 8)}</span>
                <span className="font-semibold">{l.points}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {room.recent.length > 0 && (
        <section className="mb-6 rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Your recent counted plays</h2>
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            {room.recent.map((p, i) => (
              <li key={`${p.trackId}-${i}`} className="flex justify-between gap-3">
                <span className="truncate">{p.name ?? p.trackId}</span>
                <span className="shrink-0 text-xs">
                  {new Date(p.playedAt).toLocaleString()} · {p.source ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SpotifyConnectCard />
    </main>
  );
}
