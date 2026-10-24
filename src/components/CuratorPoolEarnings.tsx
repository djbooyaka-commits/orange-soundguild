import { Suspense } from "react";
import { Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2, Coins, ExternalLink, Loader2, Send, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { curatorPoolMembership } from "@/lib/curator-pool";
import { CashoutDialog } from "@/components/CashoutDialog";
import { Button } from "@/components/ui/button";

type PoolRow = { curator_id: string; placements: number; pool_cents: number; total_placements: number; share_cents: number };
const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function earningsOptions(userId: string) {
  const month = new Date().toISOString().slice(0, 7);
  return queryOptions({
    queryKey: ["curator-pool-earnings", userId, month],
    queryFn: async () => {
      const [spotify, rooms, pool, balance, requests] = await Promise.all([
        supabase.from("curator_playlists").select("id, name, spotify_playlist_id, image_url").eq("curator_id", userId).eq("accept_pool_submissions", true),
        supabase.from("beta_rooms").select("id").eq("owner_id", userId),
        supabase.rpc("curator_pool_summary", { p_period_start: `${month}-01` }),
        supabase.rpc("get_my_referral_info").maybeSingle(),
        supabase.from("payout_requests").select("id, method, amount_cents, status, created_at, admin_note").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
      ]);
      for (const result of [spotify, rooms, pool, balance, requests]) {
        if (result.error) throw new Error("Your earnings could not be loaded. Please try again.");
      }
      const roomIds = (rooms.data ?? []).map((room) => room.id);
      const lastfm = roomIds.length
        ? await supabase.from("beta_room_playlists").select("id, name, spotify_playlist_id, image_url").in("room_id", roomIds).eq("accept_pool_submissions", true)
        : { data: [], error: null };
      if (lastfm.error) throw new Error("Your pool playlists could not be loaded. Please try again.");
      return {
        month,
        spotify: spotify.data ?? [],
        lastfm: lastfm.data ?? [],
        estimate: ((pool.data ?? []) as PoolRow[]).find((row) => row.curator_id === userId) ?? null,
        balanceCents: Number(balance.data?.balance_cents ?? 0),
        requests: requests.data ?? [],
      };
    },
  });
}

export function CuratorPoolEarnings({ userId }: { userId: string }) {
  return <Suspense fallback={<div className="flex justify-center py-16"><Loader2 aria-label="Loading earnings" className="h-6 w-6 animate-spin text-muted-foreground" /></div>}><EarningsContent userId={userId} /></Suspense>;
}

function EarningsContent({ userId }: { userId: string }) {
  const options = earningsOptions(userId);
  const { data } = useSuspenseQuery(options);
  const queryClient = useQueryClient();
  const membership = curatorPoolMembership(data.spotify.length, data.lastfm.length);
  const monthLabel = new Date(`${data.month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  const playlists = [...data.spotify.map((p) => ({ ...p, source: "Spotify tracker" })), ...data.lastfm.map((p) => ({ ...p, source: "Last.fm room" }))];

  return <div className="space-y-10">
    <section className="border-y border-border py-6">
      <div className="flex items-center gap-3">
        <CheckCircle2 className={`h-6 w-6 shrink-0 ${membership.joined ? "text-success" : "text-muted-foreground"}`} />
        <div><h2 className="text-lg font-semibold">{membership.joined ? "You're part of the Curator Pool" : "Not in the Curator Pool yet"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{membership.joined ? `${membership.playlistCount} opted-in ${membership.playlistCount === 1 ? "playlist" : "playlists"}` : "None of your playlists are opted in."}</p></div>
      </div>
      {!membership.joined && <div className="mt-4 flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/curator">Spotify playlists</Link></Button><Button asChild variant="outline"><Link to="/beta-rooms">Last.fm rooms</Link></Button></div>}
    </section>

    <section>
      <h2 className="text-lg font-semibold">Earnings · {monthLabel}</h2>
      <div className="mt-5 grid gap-6 sm:grid-cols-3">
        <div><div className="flex items-center gap-2 text-sm text-muted-foreground"><Coins className="h-4 w-4" /> Estimated share</div><p className="mt-2 text-3xl font-bold">{usd(data.estimate?.share_cents ?? 0)}</p><p className="mt-2 text-xs text-muted-foreground">Not yet available to cash out</p></div>
        <div><p className="text-sm text-muted-foreground">Qualifying placements</p><p className="mt-2 text-3xl font-bold">{data.estimate?.placements ?? 0}</p><p className="mt-2 text-xs text-muted-foreground">Approved and added Spotify submissions</p></div>
        <div><p className="text-sm text-muted-foreground">Monthly pool</p><p className="mt-2 text-3xl font-bold">{data.estimate ? usd(data.estimate.pool_cents) : "—"}</p><p className="mt-2 text-xs text-muted-foreground">{data.estimate ? `${data.estimate.total_placements} total qualifying placements` : "Unavailable until a qualifying placement is recorded"}</p></div>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">15% of qualifying Artist subscription revenue is shared between Superfan curators by qualifying placements. Estimates can change until the month ends.</p>
      <p className="mt-2 text-sm text-muted-foreground">Pool estimates are not automatically credited to your balance. The current calculation includes Spotify tracker submissions only; Last.fm room placements are not included.</p>
    </section>

    <section className="border-y border-border py-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Wallet className="h-5 w-5 text-primary" /> Available balance</h2><p className="mt-3 text-3xl font-bold">{usd(data.balanceCents)}</p><p className="mt-2 text-sm text-muted-foreground">All credited earnings, including referrals and royalties.</p></div>
        <CashoutDialog balanceCents={data.balanceCents} onSubmitted={() => { void queryClient.invalidateQueries({ queryKey: options.queryKey }); }}>
          <Button><Send /> {data.balanceCents < 2500 ? "Cash out at $25" : "Cash out"}</Button>
        </CashoutDialog>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">Minimum cashout: $25. PayPal or Phantom (SOL). Requests are reviewed and paid manually.</p>
    </section>

    {playlists.length > 0 && <section><h2 className="text-lg font-semibold">Your pool playlists</h2><ul className="mt-4 grid gap-3 sm:grid-cols-2">{playlists.map((playlist) => <li key={`${playlist.source}-${playlist.id}`} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3">
      {playlist.image_url ? <img src={playlist.image_url} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" /> : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted"><Coins className="h-5 w-5 text-muted-foreground" /></div>}
      <div className="min-w-0 flex-1"><p className="truncate font-medium">{playlist.name}</p><p className="text-xs text-muted-foreground">{playlist.source} · In the pool</p></div>
      <Button asChild variant="ghost" size="icon"><a href={`https://open.spotify.com/playlist/${playlist.spotify_playlist_id}`} target="_blank" rel="noreferrer" aria-label={`Open ${playlist.name} on Spotify`} title="Open on Spotify"><ExternalLink /></a></Button>
    </li>)}</ul></section>}

    <section><h2 className="text-lg font-semibold">Cashout requests</h2>{data.requests.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No cashout requests yet.</p> : <ul className="mt-3 divide-y divide-border">{data.requests.map((request) => <li key={request.id} className="flex items-center justify-between gap-4 py-4"><div className="min-w-0"><p className="font-medium">{request.method === "paypal" ? "PayPal" : "Phantom (SOL)"}</p><p className="text-xs text-muted-foreground">{new Date(request.created_at).toLocaleDateString()}{request.admin_note ? ` · ${request.admin_note}` : ""}</p></div><div className="shrink-0 text-right"><p className="font-semibold">{usd(request.amount_cents)}</p><p className="text-xs capitalize text-muted-foreground">{request.status}</p></div></li>)}</ul>}</section>
  </div>;
}