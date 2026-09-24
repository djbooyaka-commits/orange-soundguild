import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Music, Star, Plus, X, Loader2, AlertTriangle, TrendingUp, Send, Users, ExternalLink, Minus, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  listMyOsgArtistPicks,
  addOsgArtistPick,
  removeOsgArtistPick,
  listMyOsgRosters,
  listOsgPlaylistSubmissions,
  listOsgArtistFollowLinks,
  curatorSetOsgArtistFollowLink,
  curatorSetOsgTrackLinks,
  adjustOsgPoints,
  setOsgWeeklyMin,
} from "@/lib/api/osg-picks.functions";
import { signMany } from "@/lib/signMedia";
import defaultAvatar from "@/assets/avatar.jpg";
import { OsgDailyStreams } from "@/components/OsgDailyStreams";

const DEFAULT_WEEKLY_MIN = 600;


type Pick = {
  id: string;
  artist_id: string;
  username: string | null;
  avatar_url: string | null;
  account_type: "fan" | "artist" | "superfan" | "pioneer";
  weekly_points: number;
  weekly_min: number;
  last_deduction_at?: string | null;
};

type RosterRow = {
  curator_id: string;
  curator_username: string | null;
  curator_avatar_url: string | null;
  artist_id: string;
  username: string | null;
  avatar_url: string | null;
  account_type: "fan" | "artist" | "superfan" | "pioneer";
  weekly_points: number;
  weekly_min: number;
  is_me: boolean;
  last_deduction_at?: string | null;
};


type SubmissionRow = {
  curator_id: string;
  submitter_user_id: string;
  spotify_track_id: string;
  spotify_track_url: string;
  spotify_track_name: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

type FollowLinkRow = {
  curator_id: string;
  user_id: string;
  spotify_artist_id: string;
  spotify_artist_url: string;
  spotify_artist_name: string | null;
  track_urls: string[] | null;
  updated_at: string;
};

const emptyTracks = () => ["", "", "", "", ""];

export function OsgArtistsTab({ myUserId }: { myUserId?: string | null } = {}) {
  const listFn = useServerFn(listMyOsgArtistPicks);
  const addFn = useServerFn(addOsgArtistPick);
  const removeFn = useServerFn(removeOsgArtistPick);
  const rostersFn = useServerFn(listMyOsgRosters);
  const submissionsFn = useServerFn(listOsgPlaylistSubmissions);
  const followLinksFn = useServerFn(listOsgArtistFollowLinks);
  const adjustFn = useServerFn(adjustOsgPoints);
  const setMinFn = useServerFn(setOsgWeeklyMin);

  const [picks, setPicks] = useState<Pick[]>([]);
  const [avatars, setAvatars] = useState<(string | null)[]>([]);
  const [rosters, setRosters] = useState<RosterRow[]>([]);
  const [rosterAvatars, setRosterAvatars] = useState<(string | null)[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [followLinks, setFollowLinks] = useState<FollowLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deductInputs, setDeductInputs] = useState<Record<string, string>>({});
  const [deductingId, setDeductingId] = useState<string | null>(null);
  const [minInput, setMinInput] = useState<string>("");
  const [savingMin, setSavingMin] = useState(false);
  const [linkInputs, setLinkInputs] = useState<Record<string, string>>({});
  const [savingLinkId, setSavingLinkId] = useState<string | null>(null);
  const setLinkFn = useServerFn(curatorSetOsgArtistFollowLink);
  const setTracksFn = useServerFn(curatorSetOsgTrackLinks);
  const [roomTab, setRoomTab] = useState<Record<string, "members" | "7day">>({});
  const [trackInputs, setTrackInputs] = useState<Record<string, string[]>>({});
  const [savingTracksId, setSavingTracksId] = useState<string | null>(null);

  const myWeeklyMin = picks[0]?.weekly_min ?? DEFAULT_WEEKLY_MIN;


  const refresh = async () => {
    const [rows, rosterRows, subs, links] = await Promise.all([
      listFn() as Promise<Pick[]>,
      rostersFn() as Promise<RosterRow[]>,
      submissionsFn() as Promise<SubmissionRow[]>,
      followLinksFn() as Promise<FollowLinkRow[]>,
    ]);
    setPicks(rows);
    setRosters(rosterRows);
    setSubmissions(subs);
    setFollowLinks(links as FollowLinkRow[]);
    setTrackInputs(() => {
      const next: Record<string, string[]> = {};
      (links as FollowLinkRow[]).forEach((l) => {
        const arr = emptyTracks();
        (l.track_urls ?? []).slice(0, 5).forEach((u, i) => { arr[i] = u; });
        next[l.user_id] = arr;
      });
      return next;
    });
    const [signedPicks, signedRoster] = await Promise.all([
      signMany(rows.map((r) => ({ bucket: "avatars" as const, path: r.avatar_url }))),
      signMany(rosterRows.map((r) => ({ bucket: "avatars" as const, path: r.avatar_url }))),
    ]);
    setAvatars(signedPicks);
    setRosterAvatars(signedRoster);
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

  // Passing members (at/above minimum, or green star = pts removed in last 3 days) sort to the top
  const isRecentlyDeducted = (p: { last_deduction_at?: string | null }) =>
    !!p.last_deduction_at &&
    Date.now() - new Date(p.last_deduction_at).getTime() < 3 * 24 * 60 * 60 * 1000;
  const passRank = (p: { weekly_points: number; weekly_min: number; last_deduction_at?: string | null }) =>
    isRecentlyDeducted(p) || p.weekly_points >= (p.weekly_min || DEFAULT_WEEKLY_MIN) ? 0 : 1;
  const sortByPass = <T extends { weekly_points: number; weekly_min: number; last_deduction_at?: string | null }>(
    rows: T[],
  ) => [...rows].sort((a, b) => passRank(a) - passRank(b) || b.weekly_points - a.weekly_points);

  // Group rosters by curator
  const rostersByCurator = rosters.reduce<Record<string, RosterRow[]>>((acc, r) => {
    (acc[r.curator_id] ||= []).push(r);
    return acc;
  }, {});
  const rosterCuratorIds = Object.keys(rostersByCurator);
  const rosterAvatarByArtist = new Map<string, string | null>();
  rosters.forEach((r, i) => rosterAvatarByArtist.set(`${r.curator_id}:${r.artist_id}`, rosterAvatars[i] ?? null));

  // Latest submission lookup: key = `${curator_id}:${submitter_user_id}`
  const subByKey = new Map<string, SubmissionRow>();
  submissions.forEach((s) => subByKey.set(`${s.curator_id}:${s.submitter_user_id}`, s));

  const followLinkByKey = new Map<string, FollowLinkRow>();
  followLinks.forEach((l) => followLinkByKey.set(`${l.curator_id}:${l.user_id}`, l));

  const renderSubmission = (curatorId: string, artistId: string) => {
    const s = subByKey.get(`${curatorId}:${artistId}`);
    if (!s) {
      return (
        <div className="rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground">
          No track submitted yet
        </div>
      );
    }
    const badge =
      s.status === "approved"
        ? "bg-emerald-500/15 text-emerald-500"
        : s.status === "rejected"
          ? "bg-destructive/15 text-destructive"
          : "bg-muted text-muted-foreground";
    return (
      <a
        href={s.spotify_track_url}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs hover:border-primary/50"
      >
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">
          {s.spotify_track_name ?? s.spotify_track_url}
        </span>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge}`}>
          {s.status}
        </span>
      </a>
    );
  };

  const saveLink = async (artistId: string) => {
    const url = (linkInputs[artistId] ?? "").trim();
    if (!url) return;
    setSavingLinkId(artistId);
    try {
      await setLinkFn({ data: { artistId, artistUrl: url } });
      setLinkInputs((s) => ({ ...s, [artistId]: "" }));
      await refresh();
      toast.success("Spotify artist link saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save link");
    } finally {
      setSavingLinkId(null);
    }
  };

  const saveTracks = async (artistId: string) => {
    const current = trackInputs[artistId] ?? emptyTracks();
    setSavingTracksId(artistId);
    try {
      await setTracksFn({ data: { artistId, urls: current.map((u) => u.trim()).filter(Boolean) } });
      await refresh();
      toast.success("Track links saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save track links");
    } finally {
      setSavingTracksId(null);
    }
  };

  const renderFollowLink = (curatorId: string, artistId: string, editable = false) => {
    const link = followLinkByKey.get(`${curatorId}:${artistId}`);
    const tracks = (link?.track_urls ?? []).filter(Boolean).slice(0, 5);
    const inputs = trackInputs[artistId] ?? emptyTracks();
    return (
      <div className="space-y-2">
        {link?.spotify_artist_url ? (
          <a
            href={link.spotify_artist_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs hover:border-primary/50"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">
              Follow artist: {link.spotify_artist_name ?? link.spotify_artist_url}
            </span>
          </a>
        ) : (
          <div className="rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground">
            No Spotify artist link yet
          </div>
        )}

        {tracks.length > 0 && (
          <div className="space-y-1">
            {tracks.map((u, i) => (
              <a
                key={`${artistId}-track-${i}`}
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
          </div>
        )}

        {editable && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="url"
                placeholder="https://open.spotify.com/artist/..."
                value={linkInputs[artistId] ?? ""}
                onChange={(e) => setLinkInputs((s) => ({ ...s, [artistId]: e.target.value }))}
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => saveLink(artistId)}
                disabled={savingLinkId === artistId || !(linkInputs[artistId] ?? "").trim()}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {savingLinkId === artistId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {link?.spotify_artist_url ? "Update" : "Add link"}
              </button>
            </div>

            <div className="space-y-1">
              {inputs.map((val, i) => (
                <input
                  key={`${artistId}-in-${i}`}
                  type="url"
                  placeholder={`Track link ${i + 1}`}
                  value={val}
                  onChange={(e) =>
                    setTrackInputs((s) => {
                      const next = [...(s[artistId] ?? emptyTracks())];
                      next[i] = e.target.value;
                      return { ...s, [artistId]: next };
                    })
                  }
                  className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                />
              ))}
              <button
                type="button"
                onClick={() => saveTracks(artistId)}
                disabled={savingTracksId === artistId}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {savingTracksId === artistId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Save track links
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };


  const adjustPoints = async (artistId: string, sign: 1 | -1) => {
    const raw = deductInputs[artistId]?.trim();
    const n = raw ? Math.abs(parseInt(raw, 10)) : NaN;
    if (!n || !isFinite(n) || n <= 0) {
      toast.error("Enter a positive number of points");
      return;
    }
    setDeductingId(artistId);
    try {
      await adjustFn({
        data: {
          userId: artistId,
          delta: sign * n,
          reason: sign > 0 ? "Manual Spotify stream credit" : "Curator deduction",
        },
      });
      setDeductInputs((s) => ({ ...s, [artistId]: "" }));
      await refresh();
      toast.success(`${sign > 0 ? "Gave" : "Removed"} ${n} pts`);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not adjust points");
    } finally {
      setDeductingId(null);
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
      await setMinFn({ data: { min: n } });
      await refresh();
      setMinInput("");
      toast.success(`Minimum set to ${n}`);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save minimum");
    } finally {
      setSavingMin(false);
    }
  };

  const renderMemberCard = (
    a: {
      key: string;
      curator_id: string;
      artist_id: string;
      username: string | null;
      account_type: "fan" | "artist" | "superfan" | "pioneer";
      weekly_points: number;
      weekly_min: number;
      is_me?: boolean;
      last_deduction_at?: string | null;
      avatar?: string | null;
      showDeduct?: boolean;
    },
    trailing?: React.ReactNode,
  ) => {
    const min = a.weekly_min || DEFAULT_WEEKLY_MIN;
    const recentlyDeducted =
      !!a.last_deduction_at &&
      Date.now() - new Date(a.last_deduction_at).getTime() < 3 * 24 * 60 * 60 * 1000;
    // A green star (points removed by the curator in the last 3 days) counts as a pass
    const below = !recentlyDeducted && a.weekly_points < min;
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
        key={a.key}
        className={`relative flex flex-col gap-2 rounded-lg border p-3 transition hover:border-primary/50 ${
          a.is_me ? "border-primary/60 bg-primary/5" : "border-border"
        }`}
      >
        <div className="flex items-center gap-3">
          <Link
            to="/u/$handle"
            params={{ handle: a.username ?? a.artist_id }}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <img
              src={a.avatar ?? defaultAvatar}
              alt=""
              className="h-12 w-12 shrink-0 rounded-full object-cover"
              onError={(e) => {
                e.currentTarget.src = defaultAvatar;
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                @{a.username ?? "user"}
                {a.is_me && <span className="ml-2 text-xs text-primary">(you)</span>}
              </p>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <TypeIcon className="h-3 w-3" /> {typeLabel}
              </span>
            </div>
          </Link>
          {trailing}
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
            {a.weekly_points} / {min} total pts
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
            {below ? (
              <span className="inline-flex items-center gap-1 font-semibold">
                Below minimum
                <Star
                  className="h-3.5 w-3.5 fill-current"
                  aria-label="No curator pass this week"
                />
              </span>
            ) : (
              <span className="font-semibold">Pass</span>
            )}
          </span>
        </div>
        {a.showDeduct && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-2">
            <label
              htmlFor={`spotify-points-${a.artist_id}`}
              className="mb-1.5 block text-xs font-semibold text-foreground"
            >
              Give points to @{a.username ?? "user"}
            </label>
            <div className="flex items-center gap-2">
            <input
              id={`spotify-points-${a.artist_id}`}
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="Points"
              value={deductInputs[a.artist_id] ?? ""}
              onChange={(e) =>
                setDeductInputs((s) => ({ ...s, [a.artist_id]: e.target.value }))
              }
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-2 text-sm"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => adjustPoints(a.artist_id, 1)}
              disabled={deductingId === a.artist_id}
            >
              {deductingId === a.artist_id ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Plus />
              )}
              Give points
            </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => adjustPoints(a.artist_id, -1)}
              disabled={deductingId === a.artist_id}
              className="mt-1 h-7 px-1.5 text-destructive hover:text-destructive"
            >
              <Minus /> Remove points
            </Button>
          </div>
        )}
        {renderFollowLink(a.curator_id, a.artist_id, Boolean(a.showDeduct))}
        {renderSubmission(a.curator_id, a.artist_id)}
      </div>
    );
  };


  return (
    <div className="space-y-6">
      {/* Manage own picks (curator side) */}
      {picks.length > 0 && myUserId && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">My OSG Artists</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Users you've added. Each needs at least{" "}
                 <span className="font-medium text-foreground">{myWeeklyMin} total points</span>{" "}
                from streaming your OSG playlist.
              </p>
            </div>
            <form onSubmit={saveMin} className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <input
                type="number"
                min={0}
                placeholder={String(myWeeklyMin)}
                value={minInput}
                onChange={(e) => setMinInput(e.target.value)}
                className="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs"
              />
              <button
                type="submit"
                disabled={savingMin || !minInput.trim()}
                className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {savingMin ? "Saving…" : "Set min"}
              </button>
            </form>
          </div>

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

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sortByPass(picks.map((a, i) => ({ ...a, avatar: avatars[i] ?? null }))).map((a) =>
              renderMemberCard(
                {
                  key: a.id,
                  curator_id: myUserId,
                  artist_id: a.artist_id,
                  username: a.username,
                  account_type: a.account_type,
                  weekly_points: a.weekly_points,
                  weekly_min: a.weekly_min,
                  last_deduction_at: a.last_deduction_at ?? null,
                  avatar: a.avatar,
                  showDeduct: true,
                },
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
                </button>,
              ),
            )}
          </div>
        </div>

      )}

      {/* Empty state for curators with no picks yet */}
      {!loading && picks.length === 0 && rosterCuratorIds.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">OSG Artists</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add users who accepted your Curator invite. Each needs at least{" "}
            <span className="font-medium text-foreground">{myWeeklyMin} total points</span> from
            streaming your OSG playlist.
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
          <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No one yet. Add a tracked user by username above.
          </div>
        </div>
      )}

      {/* Rosters the current user is part of (invited side) */}
      {rosterCuratorIds.map((cid) => {
        const rows = rostersByCurator[cid];
        const first = rows[0];
        return (
          <div key={cid} className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Users className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-semibold">
                    @{first.curator_username ?? "curator"}'s OSG Artists
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {rows.length} member{rows.length === 1 ? "" : "s"} · minimum{" "}
                    {first.weekly_min || DEFAULT_WEEKLY_MIN} pts/week
                  </p>
                </div>
              </div>
              <Link
                to="/curator/osg-submit"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Send className="h-4 w-4" />
                Submit / change a track
              </Link>
            </div>

            <div className="mt-4 flex gap-2 border-b border-border">
              {(["members", "7day"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRoomTab((prev) => ({ ...prev, [cid]: t }))}
                  className={`px-3 py-2 text-sm font-medium ${
                    (roomTab[cid] ?? "members") === t
                      ? "border-b-2 border-primary text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "members" ? "Members" : "7-day streams"}
                </button>
              ))}
            </div>

            {(roomTab[cid] ?? "members") === "7day" ? (
              <OsgDailyStreams curatorId={cid} />
            ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortByPass(rows).map((r) =>
                renderMemberCard({
                  key: `${r.curator_id}:${r.artist_id}`,
                  curator_id: r.curator_id,
                  artist_id: r.artist_id,
                  username: r.username,
                  account_type: r.account_type,
                  weekly_points: r.weekly_points,
                  weekly_min: r.weekly_min,
                  is_me: r.is_me,
                  last_deduction_at: r.last_deduction_at ?? null,
                  avatar: rosterAvatarByArtist.get(`${r.curator_id}:${r.artist_id}`) ?? null,
                }),
              )}
            </div>
            )}

          </div>
        );
      })}

      {loading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}
    </div>
  );
}
