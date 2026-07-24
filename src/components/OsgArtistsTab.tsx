import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Music, Star, Plus, X, Loader2, AlertTriangle, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import {
  listMyOsgArtistPicks,
  addOsgArtistPick,
  removeOsgArtistPick,
} from "@/lib/api/osg-picks.functions";
import { signMany } from "@/lib/signMedia";
import defaultAvatar from "@/assets/avatar.jpg";

const WEEKLY_MIN = 600;

type Pick = {
  id: string;
  artist_id: string;
  username: string | null;
  avatar_url: string | null;
  account_type: "fan" | "artist" | "superfan" | "pioneer";
  weekly_points: number;
};

export function OsgArtistsTab() {
  const listFn = useServerFn(listMyOsgArtistPicks);
  const addFn = useServerFn(addOsgArtistPick);
  const removeFn = useServerFn(removeOsgArtistPick);

  const [picks, setPicks] = useState<Pick[]>([]);
  const [avatars, setAvatars] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const refresh = async () => {
    const rows = (await listFn()) as Pick[];
    setPicks(rows);
    const signed = await signMany(
      rows.map((r) => ({ bucket: "avatars" as const, path: r.avatar_url })),
    );
    setAvatars(signed);
  };

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim().replace(/^@/, "");
    if (!name) return;
    setAdding(true);
    try {
      await addFn({ data: { username: name } });
      setUsername("");
      await refresh();
      toast.success(`Added @${name}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not add artist");
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    setRemovingId(id);
    try {
      await removeFn({ data: { pickId: id } });
      await refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not remove");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold">OSG Artists</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Add users who accepted your Curator invite. Each needs at least{" "}
        <span className="font-medium text-foreground">{WEEKLY_MIN} points/week</span> from streaming
        your Curator playlists.
      </p>

      <form onSubmit={add} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="tracked user's username"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={adding || !username.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add
        </button>
      </form>

      {loading ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : picks.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No one yet. Add a tracked user by username above.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {picks.map((a, i) => {
            const below = a.weekly_points < WEEKLY_MIN;
            const typeLabel =
              a.account_type === "pioneer"
                ? "Pioneer"
                : a.account_type === "artist"
                  ? "Artist"
                  : a.account_type === "superfan"
                    ? "Superfan"
                    : "Fan";
            const TypeIcon = a.account_type === "pioneer" ? Star : Music;
            return (
              <div
                key={a.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 transition hover:border-primary/50"
              >
                <div className="flex items-center gap-3">
                  <Link
                    to="/u/$handle"
                    params={{ handle: a.username ?? a.artist_id }}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <img
                      src={avatars[i] ?? defaultAvatar}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = defaultAvatar;
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">@{a.username ?? "user"}</p>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <TypeIcon className="h-3 w-3" /> {typeLabel}
                      </span>
                    </div>
                  </Link>
                  <button
                    onClick={() => remove(a.id)}
                    disabled={removingId === a.id}
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                    aria-label="Remove"
                    title="Remove from OSG list"
                  >
                    {removingId === a.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                  </button>
                </div>

                <div
                  className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs ${
                    below
                      ? "bg-destructive/10 text-destructive"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {below ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingUp className="h-3.5 w-3.5" />
                    )}
                    {a.weekly_points} / {WEEKLY_MIN} pts this week
                  </span>
                  {below && <span className="font-semibold">Below minimum</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
