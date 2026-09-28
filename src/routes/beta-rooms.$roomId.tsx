import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ExternalLink, FlaskConical, Info, Link2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getBetaRoom, joinBetaRoom } from "@/lib/api/beta-rooms.functions";
import { listBetaRoomPlaylists } from "@/lib/api/beta-curator.functions";
import {
  getMyActiveBetaTrackingPlaylists,
  listBetaRoomLinks,
  addBetaRoomLink,
  deleteBetaRoomLink,
} from "@/lib/api/beta-playlist-rooms.functions";
import { LastfmConnectCard } from "@/components/LastfmConnectCard";
import { BetaRoomPlaylists } from "@/components/BetaRoomPlaylists";
import { BetaPlaylistRoom } from "@/components/BetaPlaylistRoom";
import { BetaRoomInvite } from "@/components/BetaRoomInvite";
import { BetaRoomSubmissions } from "@/components/BetaRoomSubmissions";
import { RoomChat } from "@/components/RoomChat";
import { RoomChatTabLabel } from "@/components/RoomChatTabLabel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AdSlotScript } from "@/components/AdSlotScript";


export const Route = createFileRoute("/beta-rooms/$roomId")({
  head: () => ({
    meta: [
      { title: "Last.fm Stream Room — Orange Sound Guild" },
      { name: "description", content: "Invite-only Last.fm stream tracker room." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Last.fm Stream Room — Orange Sound Guild" },
      { property: "og:description", content: "Invite-only Last.fm stream tracker room." },
    ],
  }),
  component: BetaRoomDetail,
});

type RoomData = Awaited<ReturnType<typeof getBetaRoom>>;

function BetaRoomDetail() {
  const { roomId } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const getFn = useServerFn(getBetaRoom);
  const joinFn = useServerFn(joinBetaRoom);
  const playlistsFn = useServerFn(listBetaRoomPlaylists);
  const activeTrackingFn = useServerFn(getMyActiveBetaTrackingPlaylists);

  const [room, setRoom] = useState<RoomData | null>(null);
  const [playlists, setPlaylists] = useState<
    Array<{ id: string; name: string; spotifyPlaylistId: string; isTeam?: boolean }>
  >([]);
  const [trackingPlaylistIds, setTrackingPlaylistIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState("tracking");

  const refreshTracking = useCallback(async () => {
    try {
      const res = await activeTrackingFn({ data: { roomId } });
      setTrackingPlaylistIds(new Set(res.playlistIds ?? []));
    } catch {
      // keep last known state
    }
  }, [activeTrackingFn, roomId]);

  const refresh = useCallback(async () => {
    try {
      const data = await getFn({ data: { roomId } });
      setRoom(data);
      try {
        const pls = (await playlistsFn({ data: { roomId } })) as Array<{
          id: string;
          name: string;
          spotifyPlaylistId: string;
          isTeam?: boolean;
        }>;
        setPlaylists(pls ?? []);
      } catch {
        setPlaylists([]);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load room");
    } finally {
      setLoading(false);
    }
  }, [getFn, playlistsFn, roomId]);


  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    void refresh();
    void refreshTracking();
    // Tracking can start/stop inside playlist tabs; keep the highlight fresh
    // without polling in a hidden tab.
    const interval = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      void refreshTracking();
    }, 60000);
    return () => clearInterval(interval);
  }, [user, refresh, refreshTracking]);

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
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-muted-foreground">
          Please{" "}
          <Link to="/auth" className="text-primary underline">
            sign in
          </Link>
          .
        </p>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">
        Room not found.
      </main>
    );
  }

  if (!room.joined) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">{room.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This is an invite-only Last.fm stream room. Use the curator&apos;s invite link to join.
        </p>
        <button
          onClick={join}
          disabled={busy}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Join this room
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 pb-40">
      <Link
        to="/beta-rooms"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> All Last.fm rooms
      </Link>

      <header className="mb-6 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FlaskConical className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{room.name}</h1>
          <p className="text-sm text-muted-foreground">
            {room.description ?? "Last.fm stream tracker room."}
          </p>
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1">
          <TabsTrigger value="tracking" className="shrink-0">Stream Tracker</TabsTrigger>
          <TabsTrigger value="playlists" className="shrink-0">Curator playlists</TabsTrigger>
          {room.isOwner && <TabsTrigger value="invite" className="shrink-0">Invite link</TabsTrigger>}
          <TabsTrigger value="submissions" className="shrink-0">Track submissions</TabsTrigger>
          <TabsTrigger value="chat" className="shrink-0 overflow-visible">
            <RoomChatTabLabel scope="beta" roomKey={roomId} active={activeTab === "chat"}>
              Chat
            </RoomChatTabLabel>
          </TabsTrigger>
          {playlists.map((p) => (
            <div key={p.id} className="relative inline-flex">
              <TabsTrigger
                value={`pl-${p.id}`}
                className={`h-auto max-w-[70vw] shrink-0 items-start justify-start whitespace-normal py-1.5 pr-6 text-left leading-tight ${
                  trackingPlaylistIds.has(p.id)
                    ? "bg-orange-500/20 text-orange-900 ring-1 ring-orange-400 data-[state=active]:bg-orange-500/30"
                    : ""
                }`}
                title={trackingPlaylistIds.has(p.id) ? "Tracking in progress — press Stop when you finish" : undefined}
              >
                <span className="line-clamp-2">{p.name}</span>
                {trackingPlaylistIds.has(p.id) && (
                  <span className="ml-1 shrink-0 animate-pulse text-orange-500" aria-label="Tracking active">
                    ●
                  </span>
                )}
                {p.isTeam && <span className="ml-1 shrink-0 text-orange-400" title="Team playlist">★</span>}
              </TabsTrigger>
              {p.spotifyPlaylistId && (
                <a
                  href={`https://open.spotify.com/playlist/${p.spotifyPlaylistId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Open playlist on Spotify"
                  aria-label="Open playlist on Spotify"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}

        </TabsList>

        {playlists.map((p) => (
          <TabsContent key={p.id} value={`pl-${p.id}`}>
            <BetaPlaylistRoom playlistId={p.id} />
          </TabsContent>
        ))}


        <TabsContent value="tracking" className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                Your points: <span className="font-semibold">{room.myPoints}</span>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <p className="text-sm font-medium leading-relaxed text-foreground">
                Open a playlist room and press <strong>Start tracking</strong> before listening.
                Press <strong>Stop</strong> when you finish; only plays during that session can
                earn points for the selected playlist.
              </p>
            </div>
          </section>

          <LastfmConnectCard />

          {room.isOwner && room.leaderboard.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-5">
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
            <section className="rounded-xl border border-border bg-card p-5">
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
        </TabsContent>

        <TabsContent value="playlists" className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm font-medium leading-relaxed text-foreground">
              Open a playlist tab and press <strong>Start tracking</strong> before listening. Press{" "}
              <strong>Stop</strong> when you finish; only plays during that session can earn points
              for the selected playlist.
            </p>
          </div>
          <BetaRoomPlaylists roomId={roomId} isOwner={room.isOwner} onChanged={refresh} />
        </TabsContent>

        {room.isOwner && (
          <TabsContent value="invite">
            <BetaRoomInvite roomId={roomId} />
          </TabsContent>
        )}

        <TabsContent value="submissions">
          <BetaRoomSubmissions roomId={roomId} isOwner={room.isOwner} />
        </TabsContent>

        <TabsContent value="chat">
          <RoomChat scope="beta" roomKey={roomId} title={`${room.name} chat`} />
        </TabsContent>
      </Tabs>

      <AdSlotScript contentKey="ad_script_beta_room" className="mt-6" />
    </main>
  );
}
