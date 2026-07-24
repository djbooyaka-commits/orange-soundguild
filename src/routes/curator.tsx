import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Star } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAccountType } from "@/hooks/useAccountType";
import { SpotifyConnectCard } from "@/components/SpotifyConnectCard";
import { CuratorPlaylistManager } from "@/components/CuratorPlaylistManager";
import { CuratorInviteManager } from "@/components/CuratorInviteManager";
import { CuratorInvitesInbox } from "@/components/CuratorInvitesInbox";
import { SubmitTrackCard } from "@/components/SubmitTrackCard";
import { CuratorSubmissionsQueue } from "@/components/CuratorSubmissionsQueue";
import { OsgArtistsTab } from "@/components/OsgArtistsTab";
import { acceptCuratorInviteByLink } from "@/lib/api/curator-invites.functions";
import { canUseOsgArtists } from "@/lib/api/osg-picks.functions";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);
  const [canUseOsg, setCanUseOsg] = useState(false);
  const canUseOsgFn = useServerFn(canUseOsgArtists);

  useEffect(() => {
    if (!user) {
      setCanUseOsg(false);
      return;
    }
    let cancelled = false;
    canUseOsgFn()
      .then((r) => {
        if (!cancelled) setCanUseOsg(Boolean(r?.allowed));
      })
      .catch(() => {
        if (!cancelled) setCanUseOsg(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, canUseOsgFn]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite");
    if (!invite) return;

    if (authLoading) return;

    if (!user) {
      // Remember invite and send them to sign in / up
      try {
        window.sessionStorage.setItem("pending_curator_invite", invite);
      } catch {
        /* ignore */
      }
      navigate({ to: "/auth" });
      return;
    }

    if (user.id === invite) {
      // Curator opened own link — just clean it
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      window.history.replaceState({}, "", url.toString());
      return;
    }

    setJoining(true);
    acceptCuratorInviteByLink({ data: { curatorId: invite } })
      .then(() => {
        toast.success("You're now being tracked for this curator's playlists.");
      })
      .catch((e: any) => {
        toast.error(e?.message ?? "Could not join curator");
      })
      .finally(() => {
        setJoining(false);
        try {
          window.sessionStorage.removeItem("pending_curator_invite");
        } catch {
          /* ignore */
        }
        const url = new URL(window.location.href);
        url.searchParams.delete("invite");
        window.history.replaceState({}, "", url.toString());
      });
  }, [user, authLoading, navigate]);

  if (authLoading || loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">
        Redirecting…
      </main>
    );
  }

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

      {joining && (
        <div className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-sm">
          Joining curator…
        </div>
      )}

      <Tabs defaultValue="curator" className="space-y-6">
        <TabsList>
          <TabsTrigger value="curator">Curator</TabsTrigger>
          {canUseOsg && <TabsTrigger value="osg-artists">OSG Artists</TabsTrigger>}
        </TabsList>

        <TabsContent value="curator" className="space-y-6">
          <SpotifyConnectCard />

          {isSuperfan ? (
            <>
              <CuratorPlaylistManager />
              <CuratorInviteManager />
              <CuratorSubmissionsQueue />
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

          <SubmitTrackCard />

          <section className="rounded-xl border border-dashed border-border bg-muted/30 p-6">
            <h2 className="text-sm font-semibold">How it works</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Curators (Superfans) add Spotify playlists they curate.</li>
              <li>Curators share their invite link with fans.</li>
              <li>Opening the link (after signing in) enrolls that user for tracking.</li>
              <li>Fans need a Spotify Premium account to connect tracking — the Web API requires Premium.</li>
              <li>When an enrolled user streams a track in full inside that Curator's playlist on Spotify, they earn 1 point.</li>
              <li>Spotify only reports streams played long enough to count — we don&apos;t see skips.</li>
              <li>OSG Artists must earn at least 600 points/week from your Curator playlists to stay in good standing.</li>
            </ul>
          </section>
        </TabsContent>

        {canUseOsg && (
          <TabsContent value="osg-artists">
            <OsgArtistsTab />
          </TabsContent>
        )}
      </Tabs>
    </main>
  );
}
