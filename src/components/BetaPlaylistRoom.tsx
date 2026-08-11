import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Loader2,
  Minus,
  Music,
  Settings,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  getBetaPlaylistRoom,
  setBetaPlaylistWeeklyMin,
  adjustBetaPlaylistPoints,
  removeBetaRoomMember,
} from "@/lib/api/beta-playlist-rooms.functions";
import { signMany } from "@/lib/signMedia";
import defaultAvatar from "@/assets/avatar.jpg";

const DEFAULT_WEEKLY_MIN = 600;

type Member = {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  account_type: string;
  points: number;
  weekly_min: number;
  last_deduction_at: string | null;
  is_me: boolean;
};

type RoomData = {
  playlist: {
    id: string;
    name: string;
    imageUrl: string | null;
    spotifyPlaylistId: string;
    weeklyMin: number;
    trackCount: number;
  };
  isOwner: boolean;
  members: Member[];
};

export function BetaPlaylistRoom({ playlistId }: { playlistId: string }) {
  const getFn = useServerFn(getBetaPlaylistRoom);
  const setMinFn = useServerFn(setBetaPlaylistWeeklyMin);
  const adjustFn = useServerFn(adjustBetaPlaylistPoints);

  const [data, setData] = useState<RoomData | null>(null);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [minInput, setMinInput] = useState("");
  const [savingMin, setSavingMin] = useState(false);
  const [deductInputs, setDeductInputs] = useState<Record<string, string>>({});
  const [deductingId, setDeductingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = (await getFn({ data: { playlistId } })) as RoomData;
    setData(r);
    const signed = await signMany(
      r.members.map((m) => ({ bucket: "avatars" as const, path: m.avatar_url })),
    );
    const map: Record<string, string | null> = {};
    r.members.forEach((m, i) => {
      map[m.user_id] = signed[i] ?? null;
    });
    setAvatars(map);
  }, [getFn, playlistId]);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((e: any) => toast.error(e?.message ?? "Could not load playlist room"))
      .finally(() => setLoading(false));
  }, [refresh]);

  const saveMin = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(minInput, 10);
    if (!isFinite(n) || n < 0) {
      toast.error("Enter a valid minimum");
      return;
    }
    setSavingMin(true);
    try {
      await setMinFn({ data: { playlistId, min: n } });
      setMinInput("");
      await refresh();
      toast.success(`Minimum set to ${n}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save minimum");
    } finally {
      setSavingMin(false);
    }
  };

  const doDeduct = async (userId: string) => {
    const raw = deductInputs[userId]?.trim();
    const n = raw ? Math.abs(parseInt(raw, 10)) : NaN;
    if (!n || !isFinite(n) || n <= 0) {
      toast.error("Enter a positive number of points");
      return;
    }
    setDeductingId(userId);
    try {
      await adjustFn({ data: { playlistId, userId, delta: -n } });
      setDeductInputs((s) => ({ ...s, [userId]: "" }));
      await refresh();
      toast.success(`Removed ${n} pts`);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not remove points");
    } finally {
      setDeductingId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading room…</p>;
  }
  if (!data) return null;

  const isRecentlyDeducted = (m: Member) =>
    !!m.last_deduction_at &&
    Date.now() - new Date(m.last_deduction_at).getTime() < 24 * 60 * 60 * 1000;
  const passRank = (m: Member) =>
    isRecentlyDeducted(m) || m.points >= (m.weekly_min || DEFAULT_WEEKLY_MIN) ? 0 : 1;
  const members = [...data.members].sort(
    (a, b) => passRank(a) - passRank(b) || b.points - a.points,
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {data.playlist.imageUrl ? (
              <img
                src={data.playlist.imageUrl}
                alt=""
                className="h-12 w-12 rounded object-cover"
              />
            ) : (
              <span className="inline-flex h-12 w-12 items-center justify-center rounded bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </span>
            )}
            <div>
              <h2 className="font-semibold">{data.playlist.name} room</h2>
              <p className="text-sm text-muted-foreground">
                Everyone invited to this room needs at least{" "}
                <span className="font-medium text-foreground">
                  {data.playlist.weeklyMin} total points
                </span>{" "}
                from streaming this playlist. Tracking {data.playlist.trackCount} track
                {data.playlist.trackCount === 1 ? "" : "s"}.
              </p>
            </div>
          </div>
          {data.isOwner && (
            <form onSubmit={saveMin} className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <input
                type="number"
                min={0}
                placeholder={String(data.playlist.weeklyMin)}
                value={minInput}
                onChange={(e) => setMinInput(e.target.value)}
                className="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs"
              />
              <button
                type="submit"
                disabled={savingMin || !minInput.trim()}
                className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {savingMin ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Set minimum"}
              </button>
            </form>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {members.length === 0 && (
            <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground sm:col-span-2">
              No members yet — share the room invite link.
            </p>
          )}
          {members.map((m) => {
            const min = m.weekly_min || DEFAULT_WEEKLY_MIN;
            const recentlyDeducted = isRecentlyDeducted(m);
            const below = !recentlyDeducted && m.points < min;
            const typeLabel =
              m.account_type === "pioneer"
                ? "Pioneer"
                : m.account_type === "artist"
                  ? "Artist"
                  : m.account_type === "superfan"
                    ? "Superfan"
                    : "Fan";
            const TypeIcon = m.account_type === "pioneer" ? Star : Music;
            return (
              <div
                key={m.user_id}
                className={`flex flex-col gap-2 rounded-lg border p-3 transition hover:border-primary/50 ${
                  m.is_me ? "border-primary/60 bg-primary/5" : "border-border"
                }`}
              >
                <Link
                  to="/u/$handle"
                  params={{ handle: m.username ?? m.user_id }}
                  className="flex min-w-0 items-center gap-3"
                >
                  <img
                    src={avatars[m.user_id] ?? defaultAvatar}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = defaultAvatar;
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      @{m.username ?? "user"}
                      {m.is_me && <span className="ml-2 text-xs text-primary">(you)</span>}
                    </p>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <TypeIcon className="h-3 w-3" /> {typeLabel}
                    </span>
                  </div>
                </Link>

                <div
                  className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs ${
                    below ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {below ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingUp className="h-3.5 w-3.5" />
                    )}
                    {m.points} / {min} total pts
                  </span>
                  <span className="inline-flex items-center gap-2">
                    {recentlyDeducted && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500"
                        title="Points were removed by the curator in the last 24 hours"
                      >
                        <Star className="h-3 w-3 fill-current" />
                        Pts removed
                      </span>
                    )}
                    <span className="font-semibold">{below ? "Below minimum" : "Pass"}</span>
                  </span>
                </div>

                {data.isOwner && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      placeholder="pts to remove"
                      value={deductInputs[m.user_id] ?? ""}
                      onChange={(e) =>
                        setDeductInputs((s) => ({ ...s, [m.user_id]: e.target.value }))
                      }
                      className="w-32 rounded-md border border-border bg-background px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => doDeduct(m.user_id)}
                      disabled={deductingId === m.user_id}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:border-destructive hover:text-destructive disabled:opacity-50"
                    >
                      {deductingId === m.user_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Minus className="h-3.5 w-3.5" />
                      )}
                      Remove pts
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
