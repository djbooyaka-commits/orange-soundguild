import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Share2, Wallet, Users, Loader2, Heart, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/hooks/useAuth";
import { getMyReferralInfo } from "@/lib/api/artist-payment.functions";
import { RoyaltyProgressCard } from "@/components/RoyaltyProgressCard";

export const Route = createFileRoute("/referrals")({
  head: () => ({
    meta: [
      { title: "Your referrals — Orange Sound Guild" },
      { name: "description", content: "Track your referral code, balance, and earnings." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReferralsPage,
});

type Info = Awaited<ReturnType<typeof getMyReferralInfo>>;

function ReferralsPage() {
  const { user, loading } = useAuth();
  const load = useServerFn(getMyReferralInfo);
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    load()
      .then(setInfo)
      .catch((e) => setErr(e instanceof Error ? e.message : "Failed to load"));
  }, [user, loading, load]);

  if (!loading && !user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="mx-auto max-w-2xl px-4 py-24 text-center">
          <h1 className="text-3xl font-bold">Sign in to see your referrals</h1>
          <p className="mt-2 text-muted-foreground">
            You need an account to view your referral code and earnings.
          </p>
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

  if (!info) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="flex min-h-[50vh] items-center justify-center">
          {err ? (
            <p className="text-sm text-destructive">{err}</p>
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          )}
        </main>
      </div>
    );
  }

  const canEarn = info.accountType === "artist" || info.accountType === "superfan";
  const origin = typeof window !== "undefined" ? window.location.origin : "https://orange-soundguild.lovable.app";
  const refLink = info.referralCode ? `${origin}/auth?ref=${info.referralCode}` : "";

  const copy = (v: string, l: string) =>
    navigator.clipboard.writeText(v).then(() => toast.success(`${l} copied`)).catch(() => toast.error("Copy failed"));

  const share = () => {
    if (navigator.share) {
      navigator.share({ title: "Join Orange Sound Guild", url: refLink }).catch(() => {});
    } else {
      copy(refLink, "Link");
    }
  };

  const balance = (info.balanceCents / 100).toFixed(2);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        {info.accountType === "superfan" && (
          <div className="mb-8 flex items-center gap-4 rounded-3xl border-2 border-pink-500/40 bg-gradient-to-br from-pink-500/10 to-purple-500/10 p-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-pink-500 text-white shadow-lg">
              <Heart className="h-8 w-8 fill-white" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-pink-600 dark:text-pink-400">Superfan</div>
              <div className="text-2xl font-bold">You're a Superfan 💖</div>
            </div>
          </div>
        )}
        {info.accountType === "artist" && (
          <div className="mb-8 flex items-center gap-4 rounded-3xl border-2 border-primary/40 bg-primary/10 p-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
              <Sparkles className="h-8 w-8" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-primary">Artist</div>
              <div className="text-2xl font-bold">Verified Artist</div>
            </div>
          </div>
        )}

        <h1 className="text-3xl font-bold tracking-tight">Referrals & earnings</h1>
        <p className="mt-2 text-muted-foreground">
          {canEarn
            ? "Share your code to earn $1 per Artist and $0.50 per Superfan who signs up — every month they renew."
            : "Upgrade to Artist ($10/mo) or Superfan ($5/mo) to start earning referral commissions."}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <Wallet className="h-4 w-4" /> Balance
            </div>
            <div className="mt-2 text-3xl font-bold">${balance}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <Users className="h-4 w-4" /> Signups
            </div>
            <div className="mt-2 text-3xl font-bold">{info.referredCount}</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <Sparkles className="h-4 w-4" /> Payouts
            </div>
            <div className="mt-2 text-3xl font-bold">{info.earnings.length}</div>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-6">
          <div className="text-sm font-semibold">Your referral code</div>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-border bg-muted px-4 py-3 text-lg font-mono font-bold tracking-widest">
              {info.referralCode ?? "—"}
            </code>
            <button
              onClick={() => info.referralCode && copy(info.referralCode, "Code")}
              className="inline-flex h-11 items-center gap-1 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
            >
              <Copy className="h-4 w-4" /> Copy
            </button>
          </div>

          <div className="mt-6 text-sm font-semibold">Your referral link</div>
          <div className="mt-3 flex items-center gap-2">
            <input
              readOnly
              value={refLink}
              className="h-11 flex-1 truncate rounded-lg border border-border bg-muted px-3 text-sm"
            />
            <button
              onClick={() => copy(refLink, "Link")}
              className="inline-flex h-11 items-center gap-1 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
            >
              <Copy className="h-4 w-4" /> Copy
            </button>
            <button
              onClick={share}
              className="inline-flex h-11 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:brightness-105"
            >
              <Share2 className="h-4 w-4" /> Share
            </button>
          </div>
        </div>

        {info.accountType === "artist" && (
          <div className="mt-8">
            <RoyaltyProgressCard userId={user?.id ?? null} />
          </div>
        )}

        <div className="mt-8 rounded-3xl border border-border bg-card p-6">
          <div className="text-sm font-semibold">Recent payouts</div>
          {info.earnings.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No payouts yet. Share your link to start earning.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {info.earnings.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <div className="font-medium capitalize">{e.tier} referral</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="font-semibold text-green-600">
                    +${(e.amount_cents / 100).toFixed(2)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!canEarn && (
          <div className="mt-8 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
            <p className="text-sm">Ready to start earning?</p>
            <Link
              to="/upgrade"
              className="mt-3 inline-flex h-10 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground"
            >
              Upgrade your account
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
