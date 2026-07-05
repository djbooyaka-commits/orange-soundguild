import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Sparkles, Upload, BarChart3, Music2, Check, Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";

const PhantomPayPanel = lazy(() => import("@/components/PhantomPayPanel"));
const PaypalPayPanel = lazy(() => import("@/components/PaypalPayPanel"));

export const Route = createFileRoute("/upgrade")({
  head: () => ({
    meta: [
      { title: "Become an Artist — Orange Sound Guild" },
      {
        name: "description",
        content:
          "Upgrade to an Artist account on Orange Sound Guild for $10/month, paid with Phantom wallet in USDC or SOL.",
      },
      { property: "og:title", content: "Become an Artist — Orange Sound Guild" },
      {
        property: "og:description",
        content: "Pay $10/mo with Phantom (USDC or SOL) to unlock artist tools on Orange Sound Guild.",
      },
      { property: "og:url", content: "https://orange-soundguild.lovable.app/upgrade" },
    ],
    links: [{ rel: "canonical", href: "https://orange-soundguild.lovable.app/upgrade" }],
  }),
  component: UpgradePage,
});

const BENEFITS = [
  { icon: Upload, title: "Unlimited uploads", desc: "Publish tracks, EPs, and albums to your artist page." },
  { icon: Music2, title: "Your artist page", desc: "A dedicated profile for fans to follow and discover your music." },
  { icon: BarChart3, title: "Listener insights", desc: "See plays, likes, and how your tracks perform over time." },
  { icon: Sparkles, title: "Full creator tools", desc: "Edit tracks, manage playlists, and pin your best work." },
];

function UpgradePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="text-center">
          <div className="mx-auto mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Become an artist</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Share your sound with the world. Pay $10/month with your Phantom wallet to unlock
            uploads, your artist page, and every creator tool on soundwave.
          </p>
        </div>

        <div className="mt-12 rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Artist plan
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-5xl font-bold">$10</span>
              <span className="text-lg text-muted-foreground">/month</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              30 days of artist access per payment. Pay with PayPal or Phantom wallet.
            </p>
          </div>

          <div className="mt-8 grid gap-8 md:grid-cols-2">
            <div>
              <div className="mb-3 text-sm font-semibold">Pay with PayPal</div>
              <Suspense
                fallback={
                  <div className="flex h-40 items-center justify-center rounded-xl border border-border bg-muted/40">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                }
              >
                <PaypalPayPanel />
              </Suspense>
            </div>
            <div>
              <div className="mb-3 text-sm font-semibold">Pay with Phantom (Solana)</div>
              <Suspense
                fallback={
                  <div className="flex h-40 items-center justify-center rounded-xl border border-border bg-muted/40">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                }
              >
                <PhantomPayPanel />
              </Suspense>
            </div>
          </div>
        </div>


        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {BENEFITS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-4 rounded-2xl border border-border bg-card/60 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">{title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-border bg-muted/30 p-6">
          <h2 className="font-semibold">What's included</h2>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {[
              "Unlimited track uploads",
              "Public artist profile",
              "Track editing & artwork",
              "Playlist creation",
              "Listener stats",
              "Fan follows & comments",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-muted-foreground">
            Payments are on-chain (Solana mainnet). All sales are final — Solana transactions
            can't be reversed.{" "}
            <Link to="/" className="underline hover:text-foreground">
              Back to home
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
