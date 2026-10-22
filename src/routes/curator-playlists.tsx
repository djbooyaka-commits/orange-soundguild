import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SubmitTrackCard } from "@/components/SubmitTrackCard";

export const Route = createFileRoute("/curator-playlists")({
  head: () => ({
    meta: [
      { title: "Curator Playlists — Submit your music | Orange Sound Guild" },
      { name: "description", content: "Artists: submit your Spotify tracks to Orange Sound Guild curator playlists. One free submission every day with your 50-point artist pass." },
      { property: "og:title", content: "Curator Playlists — Orange Sound Guild" },
      { property: "og:description", content: "Submit your tracks to curator playlists with a free daily 50-point artist pass." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CuratorPlaylistsPage,
});

function CuratorPlaylistsPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-bold">Curator Playlists</h1>
      <p className="mt-2 text-muted-foreground">
        Every playlist from curators in the Orange Sound Guild Curator Pool. Artist accounts get a free 50-point pass
        each day (resets 00:00 UTC) — no need to join a stream room.
      </p>
      <div className="mt-6">
        {signedIn === null ? null : signedIn ? (
          <SubmitTrackCard pool />
        ) : (
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <p className="text-sm text-muted-foreground">Sign in to submit your track.</p>
            <Link to="/auth" className="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Sign in
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
