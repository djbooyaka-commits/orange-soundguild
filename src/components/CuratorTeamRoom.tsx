import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Minus,
  Music,
  Plus,
  Settings,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  curatorTeamAddMember,
  curatorTeamAdjustPoints,
  curatorTeamRemoveMember,
  curatorTeamRoster,
  curatorTeamSetLinks,
  curatorTeamSetWeeklyMin,
  type CuratorTeamMember,
  type CuratorTeamRoom as TeamRoom,
} from "@/lib/api/curator-team.functions";
import { signMany } from "@/lib/signMedia";
import defaultAvatar from "@/assets/avatar.jpg";

const emptyTracks = () => ["", "", "", "", ""];

export function CuratorTeamRoom({ room }: { room: TeamRoom }) {
  const rosterFn = useServerFn(curatorTeamRoster);
  const addFn = useServerFn(curatorTeamAddMember);
  const removeFn = useServerFn(curatorTeamRemoveMember);
  const linksFn = useServerFn(curatorTeamSetLinks);
  const adjustFn = useServerFn(curatorTeamAdjustPoints);
  const minFn = useServerFn(curatorTeamSetWeeklyMin);

  const [members, setMembers] = useState<CuratorTeamMember[]>([]);
  const [avatars, setAvatars] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [minInput, setMinInput] = useState<string>(String(room.team_weekly_min));
  const [savingMin, setSavingMin] = useState(false);
  const [artistInputs, setArtistInputs] = useState<Record<string, string>>({});
  const [trackInputs, setTrackInputs] = useState<Record<string, string[]>>({});
  const [savingLinksId, setSavingLinksId] = useState<string | null>(null);
  const [pointInputs, setPointInputs] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const rows = (await rosterFn({ data: { playlistId: room.playlist_id } })) as CuratorTeamMember[];
    setMembers(rows);
    setArtistInputs(() => {
      const next: Record<string, string> = {};
      rows.forEach((r) => {
        next[r.user_id] = r.spotify_artist_url ?? "";
      });
      return next;
    });
    setTrackInputs(() => {
      const next: Record<string, string[]> = {};
      rows.forEach((r) => {
        const arr = emptyTracks();
        (r.track_urls ?? []).slice(0, 5).forEach((u, i) => {
          arr[i] = u;
        });
        next[r.user_id] = arr;
      });
      return next;
    });
    setAvatars(await signMany(rows.map((r) => ({ bucket: "avatars" as const, path: r.avatar_url }))));
  }, [rosterFn, room.playlist_id]);

  useEffect(() => {
    setLoading(true);
    refresh()
      .catch((e: any) => toast.error(e?.message ?? "Could not load this room"))
      .finally(() => setLoading(false));
  }, [refresh]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim().replace(/^@/, "");
    if (!name) return;
    setAdding(true);
    try {
      await addFn({ data: { playlistId: room.playlist_id, username: name } });
      setUsername("");
      await refresh();
      toast.success(`Added @${name}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not add member");
    } finally {
      setAdding(false);
    }
  };

  const removeMember = async (memberId: string) => {
    setBusyId(memberId);
    try {
      await removeFn({ data: { memberId } });
      await refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not remove member");
    } finally {
      setBusyId(null);
    }
  };

  const saveLinks = async (userId: string) => {
    setSavingLinksId(userId);
    try {
      await linksFn({
        data: {
          playlistId: room.playlist_id,
          userId,
          artistUrl: (artistInputs[userId] ?? "").trim(),
          urls: (trackInputs[userId] ?? emptyTracks()).map((u) => u.trim()).filter(Boolean),
        },
      });
      await refresh();
      toast.success("Links saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save links");
    } finally {
      setSavingLinksId(null);
    }
  };

  const adjust = async (userId: string, sign: 1 | -1) => {
    const raw = (pointInputs[userId] ?? "").trim();
    const n = raw ? Math.abs(parseInt(raw, 10)) : NaN;
    if (!n || !isFinite(n)) {
      toast.error("Enter a positive number of points");
      return;
    }
    setBusyId(userId);
    try {
      await adjustFn({
        data: {
          playlistId: room.playlist_id,
          userId,
          delta: sign * n,
          reason: sign > 0 ? "Manual check" : "Curator deduction",
        },
      });
      setPointInputs((s) => ({ ...s, [userId]: "" }));
      await refresh();
      toast.success(`${sign > 0 ? "Added" : "Removed"} ${n} pts`);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not adjust points");
    } finally {
      setBusyId(null);
    }
  };

  const saveMin = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(minInput, 10);
    if (!isFinite(n) || n < 0) {
      toast.error("Enter a valid minimum");
      return;
    }
    setSavingMin(true);
    try {
      await minFn({ data: { playlistId: room.playlist_id, min: n } });
      await refresh();
      toast.success(`Minimum set to ${n}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save minimum");
    } finally {
      setSavingMin(false);
    }
  };

  const isRecentlyDeducted = (m: CuratorTeamMember) =>
    !!m.last_deduction_at &&
    Date.now() - new Date(m.last_deduction_at).getTime() < 3 * 24 * 60 * 60 * 1000;
  const passRank = (m: CuratorTeamMember) =>
    isRecentlyDeducted(m) || m.points >= (m.weekly_min || 0) ? 0 : 1;
  const sorted = [...members].sort((a, b) => passRank(a) - passRank(b) || b.points - a.points);
  const avatarByUser = new Map<string, string | null>();
  members.forEach((m, i) => avatarByUser.set(m.user_id, avatars[i] ?? null));

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          {room.image_url ? (
            <img src={room.image_url} alt="" className="h-12 w-12 rounded object-cover" loading="lazy" />
          ) : (
            <div className="h-12 w-12 rounded bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 font-semibold">
              {room.name}
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                <Star className="h-3 w-3" /> Team
              </span>
            </h2>
            <a
              href={`https://open.spotify.com/playlist/${room.spotify_playlist_id}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Open in Spotify ↗
            </a>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Everyone in this room needs at least {room.team_weekly_min} points per week from this
          playlist for their tracks to stay on it.
        </p>

        {room.is_owner && (
          <form onSubmit={saveMin} className="mt-3 flex flex-wrap items-center gap-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <label className="text-xs text-muted-foreground">Weekly minimum</label>
            <input
              type="number"
              min={0}
              value={minInput}
              onChange={(e) => setMinInput(e.target.value)}
              className="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs"
            />
            <button
              type="submit"
              disabled={savingMin}
              className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              {savingMin ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
            </button>
          </form>
        )}
      </section>

      {room.is_owner && (
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="@username to add to this Team room"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={adding || !username.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add member
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading room…</p>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          No members in this Team room yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sorted.map((m) => {
            const min = m.weekly_min || 0;
            const recentlyDeducted = isRecentlyDeducted(m);
            const below = !recentlyDeducted && m.points < min;
            const tracks = (m.track_urls ?? []).filter(Boolean).slice(0, 5);
            const inputs = trackInputs[m.user_id] ?? emptyTracks();
            return (
              <div
                key={m.member_id}
                className={`flex flex-col gap-2 rounded-lg border p-3 ${
                  m.is_me ? "border-primary/60 bg-primary/5" : "border-border"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Link
                    to="/u/$handle"
                    params={{ handle: m.username ?? m.user_id }}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <img
                      src={avatarByUser.get(m.user_id) ?? defaultAvatar}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = defaultAvatar;
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        @{m.username ?? "user"}
                        {recentlyDeducted && (
                          <Star className="ml-1 inline h-3 w-3 text-emerald-500" />
                        )}
                        {m.is_me && <span className="ml-2 text-xs text-primary">(you)</span>}
                      </p>
                      <span className="text-xs capitalize text-muted-foreground">
                        {m.account_type}
                      </span>
                    </div>
                  </Link>
                  {room.is_owner && (
                    <button
                      type="button"
                      onClick={() => removeMember(m.member_id)}
                      disabled={busyId === m.member_id}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                      aria-label="Remove member"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

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
                    {m.points} pts
                  </span>
                  <span>{below ? `Below ${min}` : "Pass"}</span>
                </div>

                {m.spotify_artist_url ? (
                  <a
                    href={m.spotify_artist_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs hover:border-primary/50"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      Follow artist: {m.spotify_artist_name ?? m.spotify_artist_url}
                    </span>
                  </a>
                ) : (
                  <div className="rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground">
                    No Spotify artist link yet
                  </div>
                )}

                {tracks.map((u, i) => (
                  <a
                    key={`${m.user_id}-t-${i}`}
                    href={u}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs hover:border-primary/50"
                  >
                    <Music className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-primary underline-offset-2 hover:underline">
                      Track {i + 1}
                    </span>
                  </a>
                ))}

                {room.is_owner && (
                  <div className="space-y-1 border-t border-border pt-2">
                    <input
                      type="url"
                      placeholder="https://open.spotify.com/artist/..."
                      value={artistInputs[m.user_id] ?? ""}
                      onChange={(e) =>
                        setArtistInputs((s) => ({ ...s, [m.user_id]: e.target.value }))
                      }
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                    />
                    {inputs.map((val, i) => (
                      <input
                        key={`${m.user_id}-in-${i}`}
                        type="url"
                        placeholder={`Track link ${i + 1}`}
                        value={val}
                        onChange={(e) =>
                          setTrackInputs((s) => {
                            const next = [...(s[m.user_id] ?? emptyTracks())];
                            next[i] = e.target.value;
                            return { ...s, [m.user_id]: next };
                          })
                        }
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => saveLinks(m.user_id)}
                      disabled={savingLinksId === m.user_id}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:border-primary hover:text-primary disabled:opacity-50"
                    >
                      {savingLinksId === m.user_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      Save links
                    </button>

                    <div className="flex items-center gap-1 pt-1">
                      <input
                        type="number"
                        min={1}
                        placeholder="pts"
                        value={pointInputs[m.user_id] ?? ""}
                        onChange={(e) =>
                          setPointInputs((s) => ({ ...s, [m.user_id]: e.target.value }))
                        }
                        className="w-20 rounded-md border border-border bg-background px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => adjust(m.user_id, 1)}
                        disabled={busyId === m.user_id}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:border-primary hover:text-primary disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add pts
                      </button>
                      <button
                        type="button"
                        onClick={() => adjust(m.user_id, -1)}
                        disabled={busyId === m.user_id}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:border-destructive hover:text-destructive disabled:opacity-50"
                      >
                        <Minus className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
