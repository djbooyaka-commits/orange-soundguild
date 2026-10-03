import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useAccountType } from "@/hooks/useAccountType";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  listBetaRooms,
  createBetaRoom,
  deleteBetaRoom,
  joinBetaRoom,
  leaveBetaRoom,
} from "@/lib/api/beta-rooms.functions";
import { joinBetaRoomByCode } from "@/lib/api/beta-curator.functions";


export const Route = createFileRoute("/beta-rooms/")({
  head: () => ({
    meta: [
      { title: "Beta Stream Rooms — Orange Sound Guild" },
      {
        name: "description",
        content: "Test stream tracker rooms that count plays from anywhere — free Spotify accounts included.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Beta Stream Rooms — Orange Sound Guild" },
      { property: "og:description", content: "Experimental stream tracking sandbox." },
    ],
  }),
  component: BetaRoomsPage,
});

type Room = {
  id: string;
  name: string;
  description: string | null;
  isOwner: boolean;
  joined: boolean;
  myPoints: number;
};

function BetaRoomsPage() {
  const { user, loading: authLoading } = useAuth();
  const { accountType } = useAccountType();
  const isAdmin = useIsAdmin();
  const canCreateRoom = isAdmin || accountType === "artist" || accountType === "superfan";
  const listFn = useServerFn(listBetaRooms);
  const createFn = useServerFn(createBetaRoom);
  const deleteFn = useServerFn(deleteBetaRoom);
  const joinFn = useServerFn(joinBetaRoom);
  const leaveFn = useServerFn(leaveBetaRoom);
  const joinByCodeFn = useServerFn(joinBetaRoomByCode);
  const navigate = useNavigate();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const refresh = useCallback(async () => {
    try {
      const data = (await listFn()) as Room[];
      setRooms(data ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [listFn]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [user, refresh]);

  // Invite link: /beta-rooms?invite=CODE
  useEffect(() => {
    if (typeof window === "undefined" || authLoading) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("invite");
    if (!code) return;

    if (!user) {
      try {
        window.sessionStorage.setItem("pending_beta_invite", code);
      } catch {
        /* ignore */
      }
      navigate({ to: "/auth" });
      return;
    }

    joinByCodeFn({ data: { code } })
      .then((r: any) => {
        toast.success(`Joined ${r.name}`);
        const url = new URL(window.location.href);
        url.searchParams.delete("invite");
        window.history.replaceState({}, "", url.toString());
        navigate({ to: "/beta-rooms/$roomId", params: { roomId: r.roomId } });
      })
      .catch((e: any) => toast.error(e?.message ?? "Could not join room"));
  }, [user, authLoading, joinByCodeFn, navigate]);

  // Resume an invite saved before sign-in
  useEffect(() => {
    if (typeof window === "undefined" || authLoading || !user) return;
    let code: string | null = null;
    try {
      code = window.sessionStorage.getItem("pending_beta_invite");
    } catch {
      code = null;
    }
    if (!code) return;
    try {
      window.sessionStorage.removeItem("pending_beta_invite");
    } catch {
      /* ignore */
    }
    joinByCodeFn({ data: { code } })
      .then((r: any) => {
        toast.success(`Joined ${r.name}`);
        navigate({ to: "/beta-rooms/$roomId", params: { roomId: r.roomId } });
      })
      .catch(() => {
        /* ignore */
      });
  }, [user, authLoading, joinByCodeFn, navigate]);


  const create = async () => {
    setBusy(true);
    try {
      await createFn({ data: { name, description } });
      setName("");
      setDescription("");
      toast.success("Beta room created");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create room");
    } finally {
      setBusy(false);
    }
  };

  const toggleJoin = async (room: Room) => {
    setBusy(true);
    try {
      if (room.joined) await leaveFn({ data: { roomId: room.id } });
      else await joinFn({ data: { roomId: room.id } });
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (room: Room) => {
    if (!window.confirm(`Delete "${room.name}" and all its test data?`)) return;
    setBusy(true);
    try {
      await deleteFn({ data: { roomId: room.id } });
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
          Please <Link to="/auth" className="text-primary underline">sign in</Link> to use beta rooms.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 pb-40">
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        ← Back to Orange Sound Guild
      </Link>
      <header className="mb-6 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <FlaskConical className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Beta Stream Rooms</h1>
          <p className="text-sm text-muted-foreground">
            A sandbox for testing a new tracking rule. Your live Curator stream tracker is untouched.
          </p>
        </div>
      </header>

      <section className="mb-6 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">How this differs from the live tracker</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Points come from a watch list of individual tracks, not a playlist.</li>
          <li>A play counts wherever it happened — playlist, album, radio, search or Liked Songs.</li>
          <li>Works on free Spotify accounts; we only read your recently-played history.</li>
          <li>Beta points are separate and do not affect Curator points or OSG standing.</li>
        </ul>
      </section>

      {canCreateRoom && (
      <section className="mb-8 rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Create a test room</h2>
        <div className="mt-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Room name"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What are you testing? (optional)"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            onClick={create}
            disabled={busy || name.trim().length < 2}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create room
          </button>
        </div>
      </section>
      )}

      {rooms.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          {canCreateRoom
            ? "No beta rooms yet. Create one above to start testing."
            : "No beta rooms yet. Only Artist and Superfan accounts can create stream tracker rooms."}
        </div>
      ) : (
        <ul className="space-y-3">
          {rooms.map((r) => (
            <li key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to="/beta-rooms/$roomId"
                    params={{ roomId: r.id }}
                    className="font-semibold hover:text-primary"
                  >
                    {r.name}
                  </Link>
                  {r.description && (
                    <p className="text-xs text-muted-foreground">{r.description}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.myPoints} beta pt{r.myPoints === 1 ? "" : "s"}
                    {r.isOwner ? " · you own this room" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!r.isOwner && (
                    <button
                      onClick={() => toggleJoin(r)}
                      disabled={busy}
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                    >
                      {r.joined ? "Leave" : "Join"}
                    </button>
                  )}
                  <Link
                    to="/beta-rooms/$roomId"
                    params={{ roomId: r.id }}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Open
                  </Link>
                  {r.isOwner && (
                    <button
                      onClick={() => remove(r)}
                      disabled={busy}
                      className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
                      aria-label="Delete room"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
