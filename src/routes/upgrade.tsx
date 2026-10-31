import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { Sparkles, Upload, BarChart3, Music2, Check, Loader2, Heart, DollarSign } from "lucide-react";
import { Navbar } from "@/components/Navbar";

const PhantomPayPanel = lazy(() => import("@/components/PhantomPayPanel"));
const PaypalPayPanel = lazy(() => import("@/components/PaypalPayPanel"));

export const Route = createFileRoute("/upgrade")({
  head: () => ({
    meta: [
      { title: "Upgrade your account — Orange Sound Guild" },
      {
        name: "description",
        content:
          "Become an Artist ($10/mo) or Superfan ($5/mo). Earn referral commissions when you invite others to Orange Sound Guild.",
      },
      { property: "og:title", content: "Upgrade — Orange Sound Guild" },
      {
        property: "og:description",
        content: "Artist and Superfan plans, plus a referral system that pays.",
      },
      { property: "og:url", content: "https://orangesoundguild.com/upgrade" },
    ],
    links: [{ rel: "canonical", href: "https://orangesoundguild.com/upgrade" }],
  }),
  component: UpgradePage,
});

type Tier = "artist" | "superfan";

const ARTIST_BENEFITS = [
  { icon: Upload, title: "Unlimited uploads", desc: "Publish tracks, EPs, and albums to your artist page." },
  { icon: Music2, title: "Your artist page", desc: "A dedicated profile for fans to follow and discover your music." },
  { icon: BarChart3, title: "Listener insights", desc: "See plays, likes, and how your tracks perform over time." },
  { icon: DollarSign, title: "Earn $1 / $0.50 per referral", desc: "Get paid every time someone you invited pays for their plan." },
  {
    icon: Sparkles,
    title: "Stream royalties unlocked",
    desc: "Paid Artists earn stream royalties right away and can cash out. Pioneer Artists unlock at 500 followers, 20 Artist referrals, or 40 Superfan referrals, but need a paid Artist plan to cash out.",
  },
];

const SUPERFAN_BENEFITS = [
  { icon: Heart, title: "Big Superfan badge", desc: "Show off your Superfan status on your account page." },
  { icon: Music2, title: "Everything free members get", desc: "Listen, like, comment, follow — the full free experience." },
  { icon: DollarSign, title: "Earn $1 / $0.50 per referral", desc: "$1 when your invite goes Artist, $0.50 when they go Superfan." },
  { icon: Sparkles, title: "Renewal keeps earning", desc: "Every month your invites renew, you get paid again." },
];

function UpgradePage() {
  const [tier, setTier] = useState<Tier>("artist");
  const isArtist = tier === "artist";
  const price = isArtist ? 10 : 5;
  const benefits = isArtist ? ARTIST_BENEFITS : SUPERFAN_BENEFITS;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="text-center">
          <div className="mx-auto mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {isArtist ? <Sparkles className="h-7 w-7" /> : <Heart className="h-7 w-7" />}
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {isArtist ? "Become an artist" : "Become a Superfan"}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            {isArtist
              ? "Share your sound with the world. Unlock uploads, your artist page, and every creator tool."
              : "Support the site, wear a big Superfan badge, and earn from every friend you bring in."}
          </p>
        </div>

        {/* Tier selector */}
        <div className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-2 rounded-full border border-border bg-muted/50 p-1">
          <button
            onClick={() => setTier("artist")}
            className={`h-10 rounded-full text-sm font-semibold transition ${
              isArtist ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Artist — $10/mo
          </button>
          <button
            onClick={() => setTier("superfan")}
            className={`h-10 rounded-full text-sm font-semibold transition ${
              !isArtist ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Superfan — $5/mo
          </button>
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {isArtist ? "Artist plan" : "Superfan plan"}
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-5xl font-bold">${price}</span>
              <span className="text-lg text-muted-foreground">/month</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              30 days of {isArtist ? "artist" : "Superfan"} access per payment. Pay with PayPal or Phantom wallet.
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
                <PaypalPayPanel tier={tier} />
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
                <PhantomPayPanel tier={tier} />
              </Suspense>
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {benefits.map(({ icon: Icon, title, desc }) => (
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
          <h2 className="font-semibold">Referral program</h2>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {[
              "Artists and Superfans get a referral code",
              "$1 for each Artist you refer",
              "$0.50 for each Superfan you refer",
              "You get paid again every renewal",
              "Earnings show as credit on your account",
              "Share your link or your code",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-muted-foreground">
            All sales are final. Solana transactions can't be reversed.{" "}
            <Link to="/" className="underline hover:text-foreground">
              Back to home
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
