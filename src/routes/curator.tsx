import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Sparkles, ListMusic, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAccountType } from "@/hooks/useAccountType";

export const Route = createFileRoute("/curator")({
  head: () => ({
    meta: [
      { title: "Curator — Orange Sound Guild" },
      { name: "description", content: "Superfan-only curation tools for shaping what the Guild hears next." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Curator — Orange Sound Guild" },
      { property: "og:description", content: "Superfan-only curation tools." },
    ],
  }),
  component: CuratorPage,
});

function CuratorPage() {
  const { user, loading: authLoading } = useAuth();
  const { accountType, loading } = useAccountType();

  if (authLoading || loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>
    );
  }

  if (!user) return <Navigate to="/auth" />;

  const isSuperfan = accountType === "superfan";

  if (!isSuperfan) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Star className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold">Curator is a Superfan tool</h1>
        <p className="mt-2 text-muted-foreground">
          The Curator dashboard is available to Superfan accounts. Upgrade to help shape what the Guild hears next.
        </p>
        <Link
          to="/upgrade"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Become a Superfan
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Curator</h1>
          <p className="text-sm text-muted-foreground">
            Superfan tools for spotlighting tracks, artists, and playlists.
          </p>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <Link
          to="/discover"
          className="group rounded-xl border border-border bg-card p-5 transition hover:border-primary hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Discover new tracks</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Browse the latest uploads and flag hidden gems for the community.
          </p>
        </Link>

        <Link
          to="/library"
          className="group rounded-xl border border-border bg-card p-5 transition hover:border-primary hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
            <ListMusic className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Your playlists</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Build public playlists that other listeners can follow.
          </p>
        </Link>
      </section>

      <section className="mt-8 rounded-xl border border-dashed border-border bg-muted/30 p-6">
        <h2 className="text-sm font-semibold">More curation tools coming soon</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;re building weekly picks, artist spotlights, and collaborative curation. Your Superfan status
          reserves your seat.
        </p>
      </section>
    </main>
  );
}
