import { publicOrigin } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link2, Copy, Check, Loader2, Plus, Minus, Search, ExternalLink, TrendingUp, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { listMyCuratorInvitees, cancelCuratorInvite, getMyCuratorInviteToken } from "@/lib/api/curator-invites.functions";
import { curatorAdjustPlaylistPoints, listMyCuratorPlaylists, listCuratorPlaylistMemberBalances } from "@/lib/api/curator.functions";
import { listCuratorSubmissionsForMe } from "@/lib/api/curator-submissions.functions";
import { memberSubmissionStats, type MemberSubmission } from "@/lib/curator-member-stats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PointTimelineButton } from "@/components/PointTimelineButton";
import { signMany } from "@/lib/signMedia";
import defaultAvatar from "@/assets/avatar.jpg";

type Invitee = { id: string; user_id: string; username: string; avatar_url: string | null; avatar_signed?: string | null; status: "pending" | "accepted" | "declined"; created_at: string };
type Playlist = { id: string; name: string; spotify_playlist_id: string; is_osg?: boolean | null };

export function CuratorInviteManager() {
  const { user } = useAuth();
  const listFn = useServerFn(listMyCuratorInvitees);
  const cancelFn = useServerFn(cancelCuratorInvite);
  const playlistsFn = useServerFn(listMyCuratorPlaylists);
  const adjustFn = useServerFn(curatorAdjustPlaylistPoints);
  const balancesFn = useServerFn(listCuratorPlaylistMemberBalances);
  const submissionsFn = useServerFn(listCuratorSubmissionsForMe);
  const tokenFn = useServerFn(getMyCuratorInviteToken);
  const [items, setItems] = useState<Invitee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistId, setPlaylistId] = useState("");
  const [search, setSearch] = useState("");
  const [addInputs, setAddInputs] = useState<Record<string, string>>({});
  const [removeInputs, setRemoveInputs] = useState<Record<string, string>>({});
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [localBalances, setLocalBalances] = useState<Record<string, number>>({});
  const balanceQuery = useQuery({ queryKey: ["curator-invite-balances", user?.id, playlistId], queryFn: () => balancesFn({ data: { playlistId } }), enabled: !!user && !!playlistId });
  const submissionQuery = useQuery({ queryKey: ["curator-invite-submissions", user?.id], queryFn: () => submissionsFn(), enabled: !!user });
  const inviteUrl = useMemo(() => user && inviteToken ? `${publicOrigin()}/curator?invite=${user.id}.${inviteToken}` : "", [user, inviteToken]);
  const selectedPlaylist = playlists.find((p) => p.id === playlistId);
  const visible = items.filter((i) => i.username.toLowerCase().includes(search.trim().replace(/^@/, "").toLowerCase()));

  const refresh = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [rows, pls] = await Promise.all([listFn(), playlistsFn()]);
      const invitees = rows as Invitee[];
      const signed = await signMany(invitees.map((i) => ({ bucket: "avatars" as const, path: i.avatar_url })));
      setItems(invitees.map((i, idx) => ({ ...i, avatar_signed: signed[idx] ?? null })));
      const usable = (pls as Playlist[]).filter((p) => !p.is_osg);
      setPlaylists(usable);
      setPlaylistId((cur) => usable.some((p) => p.id === cur) ? cur : usable[0]?.id ?? "");
    } catch { setLoadError(true); } finally { setLoading(false); }
  };
  useEffect(() => {
    if (!user) return;
    void refresh();
    void tokenFn().then((r) => setInviteToken(r.token)).catch(() => toast.error("Could not load invite link"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const adjust = async (userId: string, sign: 1 | -1) => {
    const values = sign === 1 ? addInputs : removeInputs;
    const n = Number(values[userId] ?? "");
    if (!playlistId || !Number.isSafeInteger(n) || n <= 0) { toast.error("Enter a positive whole number of points"); return; }
    const pid = playlistId;
    setAdjustingId(userId);
    try {
      const res = await adjustFn({ data: { playlistId: pid, userId, delta: sign * n } });
      setLocalBalances((b) => ({ ...b, [`${pid}:${userId}`]: res.balance }));
      (sign === 1 ? setAddInputs : setRemoveInputs)((s) => ({ ...s, [userId]: "" }));
      toast.success(`${sign > 0 ? "Added" : "Removed"} ${n} pts · now ${res.balance} pts`);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not change points"); } finally { setAdjustingId(null); }
  };
  const cancel = async (i: Invitee) => {
    if (!window.confirm(`Remove @${i.username} from your tracked users across your playlists?`)) return;
    setRemovingId(i.id);
    try { await cancelFn({ data: { inviteId: i.id } }); await refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not remove member"); }
    finally { setRemovingId(null); }
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-3"><Link2 className="h-5 w-5 shrink-0 text-primary" /><h2 className="font-semibold">Your invite link</h2></div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input readOnly value={inviteUrl} aria-label="Your invite link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1" />
        <Button disabled={!inviteUrl} onClick={async () => { try { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { toast.error("Could not copy link"); } }}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy link"}
        </Button>
      </div>
      {loading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading tracked users…</p>}
      {loadError && <div className="flex items-center gap-3 text-sm text-destructive">Tracked users didn’t load.<Button variant="outline" size="sm" onClick={refresh}>Retry</Button></div>}
      {!loading && !loadError && <>
        {playlists.length > 0 ? <>
          <Tabs value={playlistId} onValueChange={(id) => { setPlaylistId(id); setAddInputs({}); setRemoveInputs({}); }}>
            <div className="max-w-full overflow-x-auto"><TabsList className="h-auto w-max justify-start gap-1">
              {playlists.map((p) => <TabsTrigger key={p.id} value={p.id} className="max-w-64 whitespace-normal text-left">{p.name}</TabsTrigger>)}
            </TabsList></div>
          </Tabs>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <h3 className="min-w-0 break-words font-semibold">{selectedPlaylist?.name} · Members ({items.filter((i) => i.status === "accepted").length})</h3>
            {selectedPlaylist?.spotify_playlist_id && <Button asChild variant="outline" size="sm"><a href={`https://open.spotify.com/playlist/${selectedPlaylist.spotify_playlist_id}`} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />Open playlist</a></Button>}
          </div>
        </> : <p className="text-sm text-muted-foreground">No Spotify playlists yet.</p>}
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search tracked users" placeholder="Search by username…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div>
        {balanceQuery.isError && <div className="flex flex-wrap items-center gap-3 text-sm text-destructive">Points didn’t load.<Button variant="outline" size="sm" onClick={() => balanceQuery.refetch()}>Retry points</Button></div>}
        {submissionQuery.isError && <div className="flex flex-wrap items-center gap-3 text-sm text-destructive">Submission totals didn’t load.<Button variant="outline" size="sm" onClick={() => submissionQuery.refetch()}>Retry totals</Button></div>}
        {visible.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{items.length ? "No matching members." : "No one has joined your link yet."}</p>}
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((i) => {
            const balance = localBalances[`${playlistId}:${i.user_id}`] ?? balanceQuery.data?.[i.user_id];
            const stats = memberSubmissionStats((submissionQuery.data ?? []) as MemberSubmission[], playlistId, i.user_id);
            return <article key={`${playlistId}:${i.id}`} className="min-w-0 space-y-3 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3"><img src={i.avatar_signed ?? defaultAvatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" onError={(e) => { e.currentTarget.src = defaultAvatar; }} /><div className="min-w-0"><p className="break-words text-sm font-semibold">@{i.username}</p><p className="text-xs capitalize text-muted-foreground">{i.status}</p></div></div>
              <p className="text-xs text-muted-foreground">Joined {new Date(i.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
              {i.status === "accepted" && playlistId && <>
                <div className="space-y-2 rounded-md bg-muted p-2 text-xs">
                  <p className="flex items-center gap-1 font-semibold"><TrendingUp className="h-3.5 w-3.5" />{balance !== undefined ? `${balance} total pts` : balanceQuery.isError ? "Points unavailable" : "Loading pts…"}</p>
                  <p className="text-muted-foreground">Used to submit: {submissionQuery.data ? <><strong className="text-foreground">{stats.points} pts</strong> ({stats.count} tracks) · 30 days</> : submissionQuery.isError ? "Unavailable" : "Loading…"}</p>
                  {balance !== undefined && submissionQuery.data && <PointTimelineButton playlistId={playlistId} userId={i.user_id} username={i.username} currentPoints={balance} spotify={{ mode: "team" }} submissionHistory={stats.submissions} />}
                </div>
                <div className="flex gap-2"><Input type="number" min={1} step={1} aria-label={`Points to add for ${i.username}`} placeholder="pts to add" value={addInputs[i.user_id] ?? ""} onChange={(e) => setAddInputs((s) => ({ ...s, [i.user_id]: e.target.value }))} className="h-8 min-w-0 flex-1 text-xs" /><Button variant="outline" size="sm" disabled={!!adjustingId} onClick={() => adjust(i.user_id, 1)}><Plus className="h-3.5 w-3.5" />Add pts</Button></div>
                <div className="flex gap-2"><Input type="number" min={1} step={1} aria-label={`Points to remove for ${i.username}`} placeholder="pts to remove" value={removeInputs[i.user_id] ?? ""} onChange={(e) => setRemoveInputs((s) => ({ ...s, [i.user_id]: e.target.value }))} className="h-8 min-w-0 flex-1 text-xs" /><Button variant="outline" size="sm" disabled={!!adjustingId} onClick={() => adjust(i.user_id, -1)}><Minus className="h-3.5 w-3.5" />Remove pts</Button></div>
              </>}
              <div className="flex justify-end"><Button variant="ghost" size="sm" disabled={!!removingId || !!adjustingId} onClick={() => cancel(i)} className="text-muted-foreground hover:text-destructive">{removingId === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}Remove</Button></div>
            </article>;
          })}
        </div>
      </>}
    </section>
  );
}
