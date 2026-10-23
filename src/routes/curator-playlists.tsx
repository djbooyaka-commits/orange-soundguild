import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SubmitTrackCard } from "@/components/SubmitTrackCard";
import { listPoolPlaylists } from "@/lib/api/curator-submissions.functions";

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

type PoolPlaylist = {
  id: string;
  name: string;
  curator_username: string;
  spotify_playlist_id: string;
  image_url: string | null;
};

function CuratorPlaylistsPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [playlists, setPlaylists] = useState<PoolPlaylist[]>([]);
  const listPool = useServerFn(listPoolPlaylists);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    listPool()
      .then((rows) => setPlaylists(rows as PoolPlaylist[]))
      .catch(() => setPlaylists([]));
  }, [signedIn, listPool]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold">Curator Playlists</h1>
      <p className="mt-2 text-muted-foreground">
        Every playlist from curators in the Orange Sound Guild Curator Pool. Artist accounts get a free 50-point pass
        each day (resets 00:00 UTC).
      </p>
      <div className="mt-6 space-y-6">
        {signedIn === null ? null : signedIn ? (
          <>
            <SubmitTrackCard pool />
            {playlists.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-2">
                {playlists.map((p) => (
                  <li key={p.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="h-16 w-16 shrink-0 rounded-md bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">@{p.curator_username}</p>
                    </div>
                    <a
                      href={`https://open.spotify.com/playlist/${p.spotify_playlist_id}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${p.name} on Spotify`}
                      title="Open on Spotify"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-primary hover:bg-muted"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
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
