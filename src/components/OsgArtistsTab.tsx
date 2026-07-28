import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Music, Star, Plus, X, Loader2, AlertTriangle, TrendingUp, Send, Users, ExternalLink, Minus, Settings } from "lucide-react";
import { toast } from "sonner";
import {
  listMyOsgArtistPicks,
  addOsgArtistPick,
  removeOsgArtistPick,
  listMyOsgRosters,
  listOsgPlaylistSubmissions,
  listOsgArtistFollowLinks,
  adjustOsgPoints,
  setOsgWeeklyMin,
} from "@/lib/api/osg-picks.functions";
import { signMany } from "@/lib/signMedia";
import defaultAvatar from "@/assets/avatar.jpg";

const DEFAULT_WEEKLY_MIN = 600;


type Pick = {
  id: string;
  artist_id: string;
  username: string | null;
  avatar_url: string | null;
  account_type: "fan" | "artist" | "superfan" | "pioneer";
  weekly_points: number;
  weekly_min: number;
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
  updated_at: string;
};

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
    setFollowLinks(links);
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

  const renderFollowLink = (curatorId: string, artistId: string) => {
    const link = followLinkByKey.get(`${curatorId}:${artistId}`);
    if (!link) {
      return (
        <div className="rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground">
          No Spotify artist link yet
        </div>
      );
    }
    return (
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
    );
  };

  const doDeduct = async (artistId: string) => {
    const raw = deductInputs[artistId]?.trim();
    const n = raw ? Math.abs(parseInt(raw, 10)) : NaN;
    if (!n || !isFinite(n) || n <= 0) {
      toast.error("Enter a positive number of points");
      return;
    }
    setDeductingId(artistId);
    try {
      await adjustFn({ data: { userId: artistId, delta: -n } });
      setDeductInputs((s) => ({ ...s, [artistId]: "" }));
      await refresh();
      toast.success(`Removed ${n} pts`);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not remove points");
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
      toast.success(`Weekly minimum set to ${n}`);
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
      avatar?: string | null;
      showDeduct?: boolean;
    },
    trailing?: React.ReactNode,
  ) => {
    const min = a.weekly_min || DEFAULT_WEEKLY_MIN;
    const below = a.weekly_points < min;
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
        className={`flex flex-col gap-2 rounded-lg border p-3 transition hover:border-primary/50 ${
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
            {a.weekly_points} / {min} pts this week
          </span>
          {below && <span className="font-semibold">Below minimum</span>}
        </div>
        {a.showDeduct && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              placeholder="pts to remove"
              value={deductInputs[a.artist_id] ?? ""}
              onChange={(e) =>
                setDeductInputs((s) => ({ ...s, [a.artist_id]: e.target.value }))
              }
              className="w-32 rounded-md border border-border bg-background px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => doDeduct(a.artist_id)}
              disabled={deductingId === a.artist_id}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:border-destructive hover:text-destructive disabled:opacity-50"
              title="Remove points"
            >
              {deductingId === a.artist_id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Minus className="h-3.5 w-3.5" />
              )}
              Remove pts
            </button>
          </div>
        )}
        {renderFollowLink(a.curator_id, a.artist_id)}
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
                <span className="font-medium text-foreground">{myWeeklyMin} points/week</span>{" "}
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
            {picks.map((a, i) =>
              renderMemberCard(
                {
                  key: a.id,
                  curator_id: myUserId,
                  artist_id: a.artist_id,
                  username: a.username,
                  account_type: a.account_type,
                  weekly_points: a.weekly_points,
                  weekly_min: a.weekly_min,
                  avatar: avatars[i] ?? null,
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
            <span className="font-medium text-foreground">{myWeeklyMin} points/week</span> from
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
                    {WEEKLY_MIN} pts/week
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

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((r) =>
                renderMemberCard({
                  key: `${r.curator_id}:${r.artist_id}`,
                  curator_id: r.curator_id,
                  artist_id: r.artist_id,
                  username: r.username,
                  account_type: r.account_type,
                  weekly_points: r.weekly_points,
                  is_me: r.is_me,
                  avatar: rosterAvatarByArtist.get(`${r.curator_id}:${r.artist_id}`) ?? null,
                }),
              )}
            </div>
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
