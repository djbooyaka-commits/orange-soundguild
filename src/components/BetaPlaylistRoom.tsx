import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ExternalLink,
  Info,
  Loader2,
  Minus,
  Music,
  Plus,
  Play,
  Settings,
  Square,
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
  setBetaPlaylistMemberFacebook,
  betaPlaylistPointHistory,
  setBetaRoomMemberJoinedAt,
  type BetaPointEvent,
} from "@/lib/api/beta-playlist-rooms.functions";
import {
  startLastfmPlaylistTracking,
  stopLastfmPlaylistTracking,
} from "@/lib/api/lastfm.functions";
import { signMany } from "@/lib/signMedia";
import defaultAvatar from "@/assets/avatar.jpg";
import { Button } from "@/components/ui/button";

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
  facebook_url: string | null;
  facebook_name: string | null;
  track_url: string | null;
  track_name: string | null;
  track2_url: string | null;
  track2_name: string | null;
  track3_url: string | null;
  track3_name: string | null;
  track4_url: string | null;
  track4_name: string | null;
  track5_url: string | null;
  track5_name: string | null;
  lastfm_username: string | null;
  joined_at: string | null;
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
  trackingStartedAt: string | null;
  members: Member[];
};

export function BetaPlaylistRoom({ playlistId }: { playlistId: string }) {
  const getFn = useServerFn(getBetaPlaylistRoom);
  const setMinFn = useServerFn(setBetaPlaylistWeeklyMin);
  const adjustFn = useServerFn(adjustBetaPlaylistPoints);
  const removeMemberFn = useServerFn(removeBetaRoomMember);
  const setLinkFn = useServerFn(setBetaPlaylistMemberLink);
  const startTrackingFn = useServerFn(startLastfmPlaylistTracking);
  const stopTrackingFn = useServerFn(stopLastfmPlaylistTracking);

  const [data, setData] = useState<RoomData | null>(null);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [minInput, setMinInput] = useState("");
  const [savingMin, setSavingMin] = useState(false);
  const [deductInputs, setDeductInputs] = useState<Record<string, string>>({});
  const [deductingId, setDeductingId] = useState<string | null>(null);
  const [awardInputs, setAwardInputs] = useState<Record<string, string>>({});
  const [awardingId, setAwardingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [linkInputs, setLinkInputs] = useState<
    Record<string, { artist: string; tracks: string[] }>
  >({});
  const [savingLinkId, setSavingLinkId] = useState<string | null>(null);
  const [changingTracking, setChangingTracking] = useState(false);
  const [trackingMsg, setTrackingMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<BetaPointEvent[]>([]);
  const historyFn = useServerFn(betaPlaylistPointHistory);
  const setJoinedFn = useServerFn(setBetaRoomMemberJoinedAt);
  const [joinedInputs, setJoinedInputs] = useState<Record<string, string>>({});
  const [savingJoinedId, setSavingJoinedId] = useState<string | null>(null);
  const setFbFn = useServerFn(setBetaPlaylistMemberFacebook);
  const [fbUrlInputs, setFbUrlInputs] = useState<Record<string, string>>({});
  const [fbNameInputs, setFbNameInputs] = useState<Record<string, string>>({});
  const [savingFbId, setSavingFbId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = (await getFn({ data: { playlistId } })) as RoomData;
    setData(r);
    if (r.isOwner) {
      try {
        setHistory((await historyFn({ data: { playlistId } })) as BetaPointEvent[]);
      } catch {
        setHistory([]);
      }
    }
    const signed = await signMany(
      r.members.map((m) => ({ bucket: "avatars" as const, path: m.avatar_url })),
    );
    const map: Record<string, string | null> = {};
    r.members.forEach((m, i) => {
      map[m.user_id] = signed[i] ?? null;
    });
    setAvatars(map);
    setLinkInputs(() => {
      const next: Record<string, { artist: string; tracks: string[] }> = {};
      r.members.forEach((m) => {
        next[m.user_id] = {
          artist: m.spotify_artist_url ?? "",
          tracks: [
            m.track_url ?? "",
            m.track2_url ?? "",
            m.track3_url ?? "",
            m.track4_url ?? "",
            m.track5_url ?? "",
          ],
        };
      });
      return next;
    });
    setFbUrlInputs(() => {
      const next: Record<string, string> = {};
      r.members.forEach((m) => {
        next[m.user_id] = m.facebook_url ?? "";
      });
      return next;
    });
    setFbNameInputs(() => {
      const next: Record<string, string> = {};
      r.members.forEach((m) => {
        next[m.user_id] = m.facebook_name ?? "";
      });
      return next;
    });
  }, [getFn, historyFn, playlistId]);

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

  const saveJoined = async (m: Member) => {
    const value =
      joinedInputs[m.user_id] ??
      (m.joined_at ? new Date(m.joined_at).toISOString().slice(0, 10) : "");
    if (!value) {
      toast.error("Pick a date");
      return;
    }
    setSavingJoinedId(m.user_id);
    try {
      await setJoinedFn({ data: { playlistId, userId: m.user_id, joinedAt: value } });
      await refresh();
      toast.success("Joined date updated");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not update the joined date");
    } finally {
      setSavingJoinedId(null);
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

  const doAward = async (userId: string) => {
    const raw = awardInputs[userId]?.trim();
    const n = raw ? Math.abs(parseInt(raw, 10)) : NaN;
    if (!n || !isFinite(n) || n <= 0) {
      toast.error("Enter a positive number of points");
      return;
    }
    setAwardingId(userId);
    try {
      await adjustFn({ data: { playlistId, userId, delta: n, reason: "Manual Last.fm check" } });
      setAwardInputs((s) => ({ ...s, [userId]: "" }));
      await refresh();
      toast.success(`Added ${n} pts`);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not add points");
    } finally {
      setAwardingId(null);
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

  const saveFacebook = async (userId: string) => {
    setSavingFbId(userId);
    try {
      await setFbFn({
        data: {
          playlistId,
          userId,
          url: (fbUrlInputs[userId] ?? "").trim(),
          name: (fbNameInputs[userId] ?? "").trim(),
        },
      });
      await refresh();
      toast.success("Facebook link saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save Facebook link");
    } finally {
      setSavingFbId(null);
    }
  };

  const saveLink = async (userId: string) => {
    const artist = (linkInputs[userId]?.artist ?? "").trim();
    const tracks = (linkInputs[userId]?.tracks ?? []).map((t) => t.trim());
    setSavingLinkId(userId);
    try {
      await setLinkFn({
        data: {
          playlistId,
          userId,
          spotifyArtistUrl: artist || null,
          trackUrl: tracks[0] || null,
          track2Url: tracks[1] || null,
          track3Url: tracks[2] || null,
          track4Url: tracks[3] || null,
          track5Url: tracks[4] || null,
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
    Date.now() - new Date(m.last_deduction_at).getTime() < 3 * 24 * 60 * 60 * 1000;
  const toggleTracking = async () => {
    setChangingTracking(true);
    setTrackingMsg(null);
    try {
      if (data.trackingStartedAt) {
        const result = await stopTrackingFn({ data: { playlistId } });
        setTrackingMsg(
          result.added
            ? `Tracking stopped. +${result.added} point${result.added === 1 ? "" : "s"} added to this playlist.`
            : `Tracking stopped. ${result.scanned} play${result.scanned === 1 ? " was" : "s were"} checked; no new matching points were found.`,
        );
      } else {
        await startTrackingFn({ data: { playlistId } });
        setTrackingMsg("Tracking started. Only plays made from now until you press Stop can earn points for this playlist.");
      }
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not change tracking");
    } finally {
      setChangingTracking(false);
    }
  };

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
                {data.playlist.trackCount === 1 ? "" : "s"}.{" "}
                {data.playlist.spotifyPlaylistId && (
                  <a
                    href={`https://open.spotify.com/playlist/${data.playlist.spotifyPlaylistId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Open playlist on Spotify
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={toggleTracking}
              disabled={changingTracking}
              variant={data.trackingStartedAt ? "destructive" : "default"}
            >
              {changingTracking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : data.trackingStartedAt ? (
                <Square className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {data.trackingStartedAt ? "Stop tracking" : "Start tracking"}
            </Button>
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

        {data.trackingStartedAt && (
          <p className="mt-3 text-xs font-medium text-primary">
            Tracking this playlist since {new Date(data.trackingStartedAt).toLocaleTimeString()}.
          </p>
        )}
        {trackingMsg && <p className="mt-3 text-xs text-muted-foreground">{trackingMsg}</p>}

        <div className="mt-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm font-medium leading-relaxed text-foreground">
            Press <strong>Start tracking</strong> before listening to this playlist on Spotify. Press{" "}
            <strong>Stop</strong> when you finish; only plays during this session can earn points
            for this playlist.
          </p>
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
                className={`relative flex flex-col gap-2 rounded-lg border p-3 transition hover:border-primary/50 ${
                  m.is_me ? "border-primary/60 bg-primary/5" : "border-border"
                }`}
              >
                {isTeam && below && (
                  <span
                    className="absolute right-2 top-2 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm"
                    title="No curator pass this week"
                    aria-label="No curator pass this week"
                  >
                    <Star className="h-7 w-7 fill-current" />
                  </span>
                )}
                {m.facebook_url && (
                  <a
                    href={m.facebook_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs font-medium text-[#1877F2] hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {m.facebook_name ?? m.facebook_url}
                    </span>
                  </a>
                )}

                {data.isOwner && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="Facebook name"
                      value={fbNameInputs[m.user_id] ?? ""}
                      onChange={(e) =>
                        setFbNameInputs((s) => ({ ...s, [m.user_id]: e.target.value }))
                      }
                      className="w-32 rounded-md border border-border bg-background px-2 py-1 text-xs"
                    />
                    <input
                      type="url"
                      placeholder="https://www.facebook.com/..."
                      value={fbUrlInputs[m.user_id] ?? ""}
                      onChange={(e) =>
                        setFbUrlInputs((s) => ({ ...s, [m.user_id]: e.target.value }))
                      }
                      className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={savingFbId === m.user_id}
                      onClick={() => saveFacebook(m.user_id)}
                    >
                      {savingFbId === m.user_id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Save FB"
                      )}
                    </Button>
                  </div>
                )}

                <Link
                  to="/u/$handle"
                  params={{ handle: m.username ?? m.user_id }}
                  className={`flex min-w-0 items-center gap-3 ${isTeam && below ? "pr-11" : ""}`}
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

                {m.lastfm_username && (
                  <a
                    href={`https://www.last.fm/user/${encodeURIComponent(m.lastfm_username)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#D51007] hover:underline"
                    title="Open Last.fm profile"
                  >
                    <ExternalLink className="h-3 w-3" />
                    last.fm/{m.lastfm_username}
                  </a>
                )}

                {isTeam && m.joined_at && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex w-fit items-center rounded-md border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Joined{" "}
                      {new Date(m.joined_at)
                        .toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                        .replace(/ /g, "-")}
                    </span>
                    {data.isOwner && (
                      <>
                        <input
                          type="date"
                          value={
                            joinedInputs[m.user_id] ??
                            new Date(m.joined_at).toISOString().slice(0, 10)
                          }
                          onChange={(e) =>
                            setJoinedInputs((s) => ({ ...s, [m.user_id]: e.target.value }))
                          }
                          className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                          aria-label="Joined date"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={savingJoinedId === m.user_id}
                          onClick={() => saveJoined(m)}
                        >
                          {savingJoinedId === m.user_id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Save date"
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                )}

                <div
                  className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs ${
                    isTeam
                      ? below
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary/10 text-primary"
                      : "bg-muted text-foreground"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {isTeam ? (
                      below ? (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      ) : (
                        <TrendingUp className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <TrendingUp className="h-3.5 w-3.5" />
                    )}
                    {isTeam ? `${m.points} / ${min} total pts` : `${m.points} total pts`}
                  </span>
                  {isTeam && (
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
                  )}
                </div>

                {data.isOwner && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      placeholder="pts to add"
                      value={awardInputs[m.user_id] ?? ""}
                      onChange={(e) =>
                        setAwardInputs((s) => ({ ...s, [m.user_id]: e.target.value }))
                      }
                      className="w-32 rounded-md border border-border bg-background px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => doAward(m.user_id)}
                      disabled={awardingId === m.user_id}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:border-primary hover:text-primary disabled:opacity-50"
                      title="Add points after a manual Last.fm check"
                    >
                      {awardingId === m.user_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      Add pts
                    </button>
                  </div>
                )}

                {data.isOwner && (
                  <div className="flex flex-wrap items-center gap-2">
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

                {/* Spotify artist profile + up to 5 track links + Last.fm (team rooms only) */}
                {isTeam && (
                <div className="space-y-1.5 rounded-md border border-border bg-muted/20 p-2">
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    Spotify links
                  </div>

                  {/* Always-clickable links */}
                  {[
                    { url: m.spotify_artist_url, label: `Artist: ${m.spotify_artist_name ?? m.spotify_artist_url}` },
                    { url: m.track_url, label: `Track 1: ${m.track_name ?? m.track_url}` },
                    { url: m.track2_url, label: `Track 2: ${m.track2_name ?? m.track2_url}` },
                    { url: m.track3_url, label: `Track 3: ${m.track3_name ?? m.track3_url}` },
                    { url: m.track4_url, label: `Track 4: ${m.track4_name ?? m.track4_url}` },
                    { url: m.track5_url, label: `Track 5: ${m.track5_name ?? m.track5_url}` },
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

                  {!m.spotify_artist_url &&
                    !m.track_url &&
                    !m.track2_url &&
                    !m.track3_url &&
                    !m.track4_url &&
                    !m.track5_url &&
                    !data.isOwner && (
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
                              tracks: s[m.user_id]?.tracks ?? [],
                            },
                          }))
                        }
                        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                      />
                      {Array.from({ length: 5 }).map((_, i) => (
                        <input
                          key={i}
                          type="url"
                          placeholder={`Track ${i + 1} — https://open.spotify.com/track/…`}
                          value={linkInputs[m.user_id]?.tracks?.[i] ?? ""}
                          onChange={(e) =>
                            setLinkInputs((s) => {
                              const prev = s[m.user_id]?.tracks ?? [];
                              const tracks = [...prev];
                              tracks[i] = e.target.value;
                              return {
                                ...s,
                                [m.user_id]: {
                                  artist: s[m.user_id]?.artist ?? "",
                                  tracks,
                                },
                              };
                            })
                          }
                          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                        />
                      ))}
                      <button
                        type="button"
                        onClick={() => saveLink(m.user_id)}
                        disabled={savingLinkId === m.user_id}
                        className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:border-primary hover:text-primary disabled:opacity-50"
                      >
                        {savingLinkId === m.user_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        Save links
                      </button>
                    </div>
                  )}
                </div>
                )}
              </div>
            );
          })}
        </div>

        {data.isOwner && history.length > 0 && (
          <div className="mt-6 rounded-lg border border-border p-4">
            <h3 className="text-sm font-semibold">Points you&apos;ve given</h3>
            <ul className="mt-2 space-y-1.5">
              {history.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                >
                  <span className="min-w-0 truncate">
                    <span
                      className={
                        h.delta > 0
                          ? "font-semibold text-primary"
                          : "font-semibold text-destructive"
                      }
                    >
                      {h.delta > 0 ? `+${h.delta}` : h.delta} pts
                    </span>{" "}
                    to @{h.username ?? "unknown"}
                    {h.reason ? ` — ${h.reason}` : ""}
                  </span>
                  <span className="shrink-0">
                    {new Date(h.created_at).toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
