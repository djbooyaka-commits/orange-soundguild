import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Sparkles, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAccountType } from "@/hooks/useAccountType";
import { SpotifyConnectCard } from "@/components/SpotifyConnectCard";
import { CuratorPlaylistManager } from "@/components/CuratorPlaylistManager";
import { CuratorInviteManager } from "@/components/CuratorInviteManager";
import { CuratorInvitesInbox } from "@/components/CuratorInvitesInbox";

export const Route = createFileRoute("/curator")({
  head: () => ({
    meta: [
      { title: "Curator — Orange Sound Guild" },
      { name: "description", content: "Curator tools: submit Spotify playlists and track streams." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Curator — Orange Sound Guild" },
      { property: "og:description", content: "Curator tools." },
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

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Curator</h1>
          <p className="text-sm text-muted-foreground">
            Track Spotify streams from Curator playlists and earn points.
          </p>
        </div>
      </header>

      <div className="space-y-6">
        <SpotifyConnectCard />

        <CuratorInvitesInbox />

        {isSuperfan ? (
          <>
            <CuratorPlaylistManager />
            <CuratorInviteManager />
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
            <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Star className="h-5 w-5" />
            </div>
            <h2 className="font-semibold">Want to submit playlists?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Superfans can add Spotify playlists to the Curator program. Anyone can connect Spotify and earn points by streaming them.
            </p>
            <Link
              to="/upgrade"
              className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Become a Superfan
            </Link>
          </div>
        )}

        <section className="rounded-xl border border-dashed border-border bg-muted/30 p-6">
          <h2 className="text-sm font-semibold">How it works</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Superfans (Curators) add Spotify playlists they curate.</li>
            <li>Curators invite specific users by username — only invited users are tracked.</li>
            <li>Invited users connect Spotify and accept the invite from this page.</li>
            <li>When an invited user streams a track (over 30s) inside that Curator's playlist on Spotify, they earn 1 point.</li>
            <li>Spotify only reports streams played long enough to count — we don&apos;t see skips.</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
