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
  UserMinus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  getBetaPlaylistRoom,
  setBetaPlaylistWeeklyMin,
  adjustBetaPlaylistPoints,
  removeBetaRoomMember,
  setBetaPlaylistMemberLink,
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
  spotify_artist_url: string | null;
  spotify_artist_name: string | null;
  track_url: string | null;
  track_name: string | null;
  track2_url: string | null;
  track2_name: string | null;
  lastfm_username: string | null;
};

type RoomData = {
  playlist: {
    id: string;
    name: string;
    imageUrl: string | null;
    spotifyPlaylistId: string;
    weeklyMin: number;
    trackCount: number;
    isTeam: boolean;
  };
  isOwner: boolean;
  members: Member[];
};

export function BetaPlaylistRoom({ playlistId }: { playlistId: string }) {
  const getFn = useServerFn(getBetaPlaylistRoom);
  const setMinFn = useServerFn(setBetaPlaylistWeeklyMin);
  const adjustFn = useServerFn(adjustBetaPlaylistPoints);
  const removeMemberFn = useServerFn(removeBetaRoomMember);
  const setLinkFn = useServerFn(setBetaPlaylistMemberLink);

  const [data, setData] = useState<RoomData | null>(null);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [minInput, setMinInput] = useState("");
  const [savingMin, setSavingMin] = useState(false);
  const [deductInputs, setDeductInputs] = useState<Record<string, string>>({});
  const [deductingId, setDeductingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [linkInputs, setLinkInputs] = useState<
    Record<string, { artist: string; track: string; track2: string }>
  >({});
  const [savingLinkId, setSavingLinkId] = useState<string | null>(null);

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
    setLinkInputs(() => {
      const next: Record<string, { artist: string; track: string; track2: string }> = {};
      r.members.forEach((m) => {
        next[m.user_id] = {
          artist: m.spotify_artist_url ?? "",
          track: m.track_url ?? "",
          track2: m.track2_url ?? "",
        };
      });
      return next;
    });
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

  const doRemoveMember = async (userId: string, username: string | null) => {
    if (!window.confirm(`Remove @${username ?? "this user"} from the room?`)) return;
    setRemovingId(userId);
    try {
      await removeMemberFn({ data: { playlistId, userId } });
      await refresh();
      toast.success("Member removed");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not remove member");
    } finally {
      setRemovingId(null);
    }
  };

  const saveLink = async (userId: string) => {
    const artist = (linkInputs[userId]?.artist ?? "").trim();
    const track = (linkInputs[userId]?.track ?? "").trim();
    const track2 = (linkInputs[userId]?.track2 ?? "").trim();
    setSavingLinkId(userId);
    try {
      await setLinkFn({
        data: {
          playlistId,
          userId,
          spotifyArtistUrl: artist || null,
          trackUrl: track || null,
          track2Url: track2 || null,
        },
      });
      await refresh();
      toast.success("Links saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save links");
    } finally {
      setSavingLinkId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading room…</p>;
  }
  if (!data) return null;

  const isRecentlyDeducted = (m: Member) =>
    !!m.last_deduction_at &&
    Date.now() - new Date(m.last_deduction_at).getTime() < 24 * 60 * 60 * 1000;
  const isTeam = data.playlist.isTeam;
  const passRank = (m: Member) =>
    !isTeam || isRecentlyDeducted(m) || m.points >= (m.weekly_min || DEFAULT_WEEKLY_MIN) ? 0 : 1;
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
              <h2 className="font-semibold">
                {data.playlist.name} room
                {isTeam && (
                  <span className="ml-2 align-middle text-base text-orange-500" title="Team room">
                    ★
                  </span>
                )}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isTeam ? (
                  <>
                    Each needs at least{" "}
                    <span className="font-medium text-foreground">
                      {data.playlist.weeklyMin} total points
                    </span>{" "}
                    from streaming your OSG playlist.{" "}
                  </>
                ) : null}
                Tracking {data.playlist.trackCount} track
                {data.playlist.trackCount === 1 ? "" : "s"}.
              </p>
            </div>
          </div>
          {data.isOwner && isTeam && (
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
                    {!m.is_me && (
                      <button
                        type="button"
                        onClick={() => doRemoveMember(m.user_id, m.username)}
                        disabled={removingId === m.user_id}
                        className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:border-destructive hover:text-destructive disabled:opacity-50"
                        title="Remove member from room"
                      >
                        {removingId === m.user_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserMinus className="h-3.5 w-3.5" />
                        )}
                        Remove
                      </button>
                    )}
                  </div>
                )}

                {/* Spotify artist profile + 2 track links + Last.fm */}
                <div className="space-y-1.5 rounded-md border border-border bg-muted/20 p-2">
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    Spotify links
                  </div>

                  {/* Always-clickable links */}
                  {[
                    { url: m.spotify_artist_url, label: `Artist: ${m.spotify_artist_name ?? m.spotify_artist_url}` },
                    { url: m.track_url, label: `Track 1: ${m.track_name ?? m.track_url}` },
                    { url: m.track2_url, label: `Track 2: ${m.track2_name ?? m.track2_url}` },
                  ]
                    .filter((x) => !!x.url)
                    .map((x) => (
                      <a
                        key={x.url as string}
                        href={x.url as string}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-primary hover:border-primary/50 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{x.label}</span>
                      </a>
                    ))}

                  {!m.spotify_artist_url && !m.track_url && !m.track2_url && !data.isOwner && (
                    <div className="rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground">
                      No Spotify links yet
                    </div>
                  )}

                  {/* Last.fm profile */}
                  {m.lastfm_username ? (
                    <a
                      href={`https://www.last.fm/user/${encodeURIComponent(m.lastfm_username)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-md border border-[#D51007]/30 bg-[#D51007]/5 px-2 py-1.5 text-xs hover:border-[#D51007]/60 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#D51007]" />
                      <span className="min-w-0 flex-1 truncate">
                        Last.fm: {m.lastfm_username}
                      </span>
                    </a>
                  ) : (
                    <div className="rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground">
                      Last.fm not connected
                    </div>
                  )}

                  {/* Owner editing */}
                  {data.isOwner && (
                    <div className="space-y-1.5 pt-1">
                      <input
                        type="url"
                        placeholder="https://open.spotify.com/artist/…"
                        value={linkInputs[m.user_id]?.artist ?? ""}
                        onChange={(e) =>
                          setLinkInputs((s) => ({
                            ...s,
                            [m.user_id]: {
                              artist: e.target.value,
                              track: s[m.user_id]?.track ?? "",
                              track2: s[m.user_id]?.track2 ?? "",
                            },
                          }))
                        }
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                      />
                      <input
                        type="url"
                        placeholder="Track 1 — https://open.spotify.com/track/…"
                        value={linkInputs[m.user_id]?.track ?? ""}
                        onChange={(e) =>
                          setLinkInputs((s) => ({
                            ...s,
                            [m.user_id]: {
                              artist: s[m.user_id]?.artist ?? "",
                              track: e.target.value,
                              track2: s[m.user_id]?.track2 ?? "",
                            },
                          }))
                        }
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          placeholder="Track 2 — https://open.spotify.com/track/…"
                          value={linkInputs[m.user_id]?.track2 ?? ""}
                          onChange={(e) =>
                            setLinkInputs((s) => ({
                              ...s,
                              [m.user_id]: {
                                artist: s[m.user_id]?.artist ?? "",
                                track: s[m.user_id]?.track ?? "",
                                track2: e.target.value,
                              },
                            }))
                          }
                          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => saveLink(m.user_id)}
                          disabled={savingLinkId === m.user_id}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:border-primary hover:text-primary disabled:opacity-50"
                        >
                          {savingLinkId === m.user_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
