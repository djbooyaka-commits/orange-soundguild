import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Radio, ExternalLink } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { listPlaylistsForSubmission } from "@/lib/api/curator-submissions.functions";
import { AdBannerScriptSt } from "@/components/AdBannerScriptSt";

export const Route = createFileRoute("/st-rooms")({
  head: () => ({
    meta: [
      { title: "S.T. Rooms — Orange Sound Guild" },
      { name: "description", content: "Your Curator stream tracker rooms." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StRoomsPage,
});

type Playlist = {
  id: string;
  curator_id: string;
  curator_username: string;
  spotify_playlist_id: string;
  name: string;
  image_url: string | null;
  available_points: number;
};

function StRoomsPage() {
  const { user, loading: authLoading } = useAuth();
  const listFn = useServerFn(listPlaylistsForSubmission);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = (await listFn()) as Playlist[];
        if (!cancelled) setPlaylists(data ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, listFn]);

  if (authLoading || loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <p className="text-sm text-muted-foreground">
          Please <Link to="/auth" className="text-primary underline">sign in</Link> to view your S.T. rooms.
        </p>
      </main>
    );
  }

  // Group by curator
  const byCurator = new Map<
    string,
    { curator_id: string; curator_username: string; playlists: Playlist[]; total: number }
  >();
  for (const p of playlists) {
    const key = p.curator_id;
    const g = byCurator.get(key) ?? {
      curator_id: p.curator_id,
      curator_username: p.curator_username,
      playlists: [],
      total: 0,
    };
    g.playlists.push(p);
    g.total += p.available_points;
    byCurator.set(key, g);
  }
  const groups = Array.from(byCurator.values());

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Radio className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">S.T. Rooms</h1>
          <p className="text-sm text-muted-foreground">
            Curator stream tracker rooms you've joined. Stream a playlist on Spotify to earn points,
            then spend them from the Curator page.
          </p>
        </div>
      </header>

      <AdBannerScriptSt className="mb-6" />

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          You haven't joined any Curator rooms yet. Open a Curator invite link to get started.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.curator_id} className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">@{g.curator_username}</h2>
                  <p className="text-xs text-muted-foreground">
                    {g.playlists.length} playlist{g.playlists.length === 1 ? "" : "s"} · {g.total} pts available
                  </p>
                </div>
                <Link
                  to="/curator"
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                >
                  Submit a track
                </Link>
              </div>

              <ul className="grid gap-3 sm:grid-cols-2">
                {g.playlists.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-md border border-border p-3"
                  >
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt=""
                        className="h-14 w-14 rounded object-cover"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.available_points} pts available
                      </p>
                    </div>
                    <a
                      href={`https://open.spotify.com/playlist/${p.spotify_playlist_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      <ExternalLink className="h-3 w-3" /> Open
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <AdBannerScriptSt className="mt-8" />
    </main>
  );
}
