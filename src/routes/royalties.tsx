import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Award, Loader2, Wallet, TrendingUp, Music2, Send } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/hooks/useAuth";
import { useAccountType } from "@/hooks/useAccountType";
import { useRoyaltyProgress } from "@/hooks/useRoyaltyProgress";
import { RoyaltyProgressCard } from "@/components/RoyaltyProgressCard";
import { CashoutDialog } from "@/components/CashoutDialog";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/royalties")({
  head: () => ({
    meta: [
      { title: "Stream royalties — Orange Sound Guild" },
      {
        name: "description",
        content: "Track your royalty eligibility, monthly pool share, and past payouts.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RoyaltiesPage,
});

type Payout = {
  id: string;
  period_start: string;
  pool_cents: number;
  amount_cents: number;
  artist_weighted_plays: number;
  total_weighted_plays: number;
  created_at: string;
};

type PayoutRequest = {
  id: string;
  method: "paypal" | "phantom";
  destination: string;
  amount_cents: number;
  status: "pending" | "processing" | "paid" | "rejected";
  admin_note: string | null;
  created_at: string;
  processed_at: string | null;
};

function RoyaltiesPage() {
  const { user, loading: authLoading } = useAuth();
  const { isArtist, loading: acctLoading } = useAccountType();
  const { data: progress } = useRoyaltyProgress(user?.id);
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [balanceCents, setBalanceCents] = useState<number>(0);
  const [requests, setRequests] = useState<PayoutRequest[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("royalty_payouts")
      .select("id, period_start, pool_cents, amount_cents, artist_weighted_plays, total_weighted_plays, created_at")
      .eq("user_id", user.id)
      .order("period_start", { ascending: false })
      .limit(24)
      .then(({ data }) => setPayouts((data ?? []) as Payout[]));
    supabase
      .from("profiles")
      .select("credit_balance_cents")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setBalanceCents(Number(data?.credit_balance_cents ?? 0)));
    supabase
      .from("payout_requests")
      .select("id, method, destination, amount_cents, status, admin_note, created_at, processed_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setRequests((data ?? []) as PayoutRequest[]));
  }, [user, reloadKey]);

  if (authLoading || acctLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="mx-auto max-w-2xl px-4 py-24 text-center">
          <h1 className="text-3xl font-bold">Sign in to see your royalties</h1>
          <Link
            to="/auth"
            className="mt-6 inline-flex h-10 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
          >
            Sign in
          </Link>
        </main>
      </div>
    );
  }

  if (!isArtist) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="mx-auto max-w-2xl px-4 py-24 text-center">
          <div className="mx-auto mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Award className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold">Stream royalties are for artists</h1>
          <p className="mt-3 text-muted-foreground">
            Upgrade to an Artist account to start earning from the monthly royalty pool.
          </p>
          <Link
            to="/upgrade"
            className="mt-6 inline-flex h-10 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
          >
            Become an artist
          </Link>
        </main>
      </div>
    );
  }

  const eligible = progress?.eligible ?? false;
  const totalEarnedCents = (payouts ?? []).reduce((s, p) => s + p.amount_cents, 0);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
              eligible ? "bg-emerald-500 text-white" : "bg-primary/10 text-primary"
            }`}
          >
            <Award className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Stream royalties</h1>
            <p className="text-sm text-muted-foreground">
              {eligible
                ? "You're eligible — your plays count toward the monthly pool."
                : "Hit any one threshold below to unlock your share of the pool."}
            </p>
          </div>
        </div>

        <div
          className={`mt-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold ${
            eligible
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${eligible ? "bg-emerald-500" : "bg-muted-foreground/60"}`}
          />
          {eligible ? "Royalty-eligible" : "Not eligible yet"}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <Wallet className="h-4 w-4" /> Current balance
            </div>
            <div className="mt-2 text-3xl font-bold">${(balanceCents / 100).toFixed(2)}</div>
            <div className="mt-1 text-xs text-muted-foreground">Includes referrals + royalties</div>
            <CashoutDialog
              balanceCents={balanceCents}
              onSubmitted={() => setReloadKey((k) => k + 1)}
            >
              <button
                type="button"
                className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={balanceCents < 2500}
              >
                <Send className="h-3.5 w-3.5" />
                {balanceCents < 2500 ? "Cash out at $25" : "Cash out"}
              </button>
            </CashoutDialog>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <TrendingUp className="h-4 w-4" /> Royalties earned
            </div>
            <div className="mt-2 text-3xl font-bold">${(totalEarnedCents / 100).toFixed(2)}</div>
            <div className="mt-1 text-xs text-muted-foreground">Across {payouts?.length ?? 0} months</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <Music2 className="h-4 w-4" /> Followers
            </div>
            <div className="mt-2 text-3xl font-bold">{progress?.followers ?? 0}</div>
          </div>
        </div>

        <div className="mt-8">
          <RoyaltyProgressCard userId={user.id} />
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-6">
          <div className="text-sm font-semibold">How the pool works</div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>• Every Artist sub adds $5 and every Superfan sub adds $3 to that month's pool.</li>
            <li>• Plays by paid listeners are weighted: Artist listener = 2, Superfan listener = 1.</li>
            <li>• Your share = pool × (your weighted plays ÷ all eligible artists' weighted plays).</li>
            <li>• Payouts run on the 1st of each month and credit your balance automatically.</li>
          </ul>
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-6">
          <div className="text-sm font-semibold">Monthly payouts</div>
          {payouts === null ? (
            <div className="mt-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : payouts.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No payouts yet. The first payout runs on the 1st of next month.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {payouts.map((p) => {
                const period = new Date(p.period_start).toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                });
                const sharePct =
                  p.total_weighted_plays > 0
                    ? ((p.artist_weighted_plays / p.total_weighted_plays) * 100).toFixed(1)
                    : "0";
                return (
                  <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <div className="font-medium">{period}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.artist_weighted_plays.toLocaleString()} weighted plays · {sharePct}% of pool ($
                        {(p.pool_cents / 100).toFixed(2)})
                      </div>
                    </div>
                    <div className="font-semibold text-emerald-600">
                      +${(p.amount_cents / 100).toFixed(2)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-6">
          <div className="text-sm font-semibold">Cashout requests</div>
          {requests === null ? (
            <div className="mt-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : requests.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No cashout requests yet. Your balance must be at least $25 to request one.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {requests.map((r) => {
                const when = new Date(r.created_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });
                const statusColor =
                  r.status === "paid"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : r.status === "rejected"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-muted text-muted-foreground";
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">
                        {r.method === "paypal" ? "PayPal" : "Phantom"} ·{" "}
                        <span className="text-muted-foreground truncate">{r.destination}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Requested {when}
                        {r.admin_note ? ` · ${r.admin_note}` : ""}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="font-semibold">${(r.amount_cents / 100).toFixed(2)}</div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusColor}`}>
                        {r.status}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
