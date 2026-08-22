import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getBetaRoom, joinBetaRoom } from "@/lib/api/beta-rooms.functions";
import { listBetaRoomPlaylists } from "@/lib/api/beta-curator.functions";
import { LastfmConnectCard } from "@/components/LastfmConnectCard";
import { BetaRoomPlaylists } from "@/components/BetaRoomPlaylists";
import { BetaPlaylistRoom } from "@/components/BetaPlaylistRoom";
import { BetaRoomInvite } from "@/components/BetaRoomInvite";
import { BetaRoomSubmissions } from "@/components/BetaRoomSubmissions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";


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

  const [room, setRoom] = useState<RoomData | null>(null);
  const [playlists, setPlaylists] = useState<Array<{ id: string; name: string; isTeam?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await getFn({ data: { roomId } });
      setRoom(data);
      try {
        const pls = (await playlistsFn({ data: { roomId } })) as Array<{
          id: string;
          name: string;
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
  }, [user, refresh]);

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

      <Tabs defaultValue="tracking" className="space-y-6">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 p-1">
          <TabsTrigger value="tracking" className="shrink-0">Stream Tracker</TabsTrigger>
          <TabsTrigger value="playlists" className="shrink-0">Curator playlists</TabsTrigger>
          {room.isOwner && <TabsTrigger value="invite" className="shrink-0">Invite link</TabsTrigger>}
          <TabsTrigger value="submissions" className="shrink-0">Track submissions</TabsTrigger>
          {playlists.map((p) => (
            <TabsTrigger key={p.id} value={`pl-${p.id}`} className="max-w-[45vw] shrink-0 truncate">
              {p.name}
              {p.isTeam && <span className="ml-1 text-orange-400" title="Team playlist">★</span>}
            </TabsTrigger>
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
            <p className="mt-3 text-xs text-muted-foreground">
              Open a playlist room and press Start tracking before listening. Press Stop when you
              finish; only plays during that session can earn points for the selected playlist.
            </p>
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

        <TabsContent value="playlists">
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
      </Tabs>
    </main>
  );
}
