import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Sparkles, Upload, BarChart3, Music2, Check } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/hooks/useAuth";
import { useAccountType } from "@/hooks/useAccountType";
import { toast } from "sonner";

export const Route = createFileRoute("/upgrade")({
  head: () => ({
    meta: [
      { title: "Become an Artist — soundwave" },
      {
        name: "description",
        content:
          "Upgrade to an Artist account for $10/month and unlock uploads, your artist page, and full creator tools on soundwave.",
      },
      { property: "og:title", content: "Become an Artist — soundwave" },
      {
        property: "og:description",
        content: "Unlock uploads and your artist page for $10/month.",
      },
    ],
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
  const { user } = useAuth();
  const { isArtist, isFan, upgradeToArtist, loading } = useAccountType();
  const navigate = useNavigate();

  const handleUpgrade = async () => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    try {
      await upgradeToArtist();
      toast.success("Welcome, artist! You can now upload music.");
      navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upgrade failed");
    }
  };

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
            Share your sound with the world. Upgrade your account to unlock uploads, your artist
            page, and every creator tool on soundwave.
          </p>
        </div>

        <div className="mt-12 grid gap-6 rounded-3xl border border-border bg-card p-8 shadow-sm md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Artist plan
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-5xl font-bold">$10</span>
              <span className="text-lg text-muted-foreground">/month</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Cancel anytime. Keep your uploads even if you switch back.
            </p>
          </div>
          <button
            onClick={handleUpgrade}
            disabled={loading || isArtist}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {isArtist
              ? "You're an artist"
              : !user
                ? "Sign in to upgrade"
                : "Become an artist"}
          </button>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {BENEFITS.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="flex gap-4 rounded-2xl border border-border bg-card/60 p-5"
            >
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
        </div>

        {isFan && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Not ready?{" "}
            <Link to="/" className="font-medium text-foreground hover:underline">
              Keep exploring as a fan
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}
