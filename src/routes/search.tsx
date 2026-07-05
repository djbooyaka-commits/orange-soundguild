import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Search as SearchIcon } from "lucide-react";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/search")({
  validateSearch: zodValidator(searchSchema),
  component: SearchPage,
  errorComponent: ({ error }) => <div role="alert" className="p-6">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Not found.</div>,
  head: () => ({
    meta: [
      { title: "Search — Orange Sound Guild" },
      { name: "description", content: "Search artists, tracks and genres on Orange Sound Guild." },
      { property: "og:title", content: "Search — Orange Sound Guild" },
      { property: "og:description", content: "Search artists, tracks and genres on Orange Sound Guild." },
      { property: "og:url", content: "https://orange-soundguild.lovable.app/search" },
    ],
    links: [{ rel: "canonical", href: "https://orange-soundguild.lovable.app/search" }],
  }),
});

type TrackRow = {
  id: string;
  title: string;
  genre: string | null;
  cover_art_url: string | null;
  user_id: string;
  plays_count: number | null;
};
type ProfileRow = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  account_type: string | null;
};
type PlaylistRow = {
  id: string;
  name: string;
  user_id: string;
  ownerHandle: string | null;
};

function SearchPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const [input, setInput] = useState(q);
  const [tracks, setTracks] = useState<TrackRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setTracks([]);
      setProfiles([]);
      setPlaylists([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const like = `%${term.replace(/[%_]/g, (m: string) => "\\" + m)}%`;
    (async () => {
      const [t, p, pl] = await Promise.all([
        supabase
          .from("tracks")
          .select("id,title,genre,cover_art_url,user_id,plays_count")
          .or(`title.ilike.${like},genre.ilike.${like}`)
          .order("plays_count", { ascending: false })
          .limit(50),
        supabase
          .from("profiles")
          .select("id,username,avatar_url,account_type")
          .ilike("username", like)
          .limit(30),
        supabase
          .from("playlists")
          .select("id,name,user_id,profiles(username)")
          .ilike("name", like)
          .limit(30),
      ]);
      if (cancelled) return;
      setTracks((t.data as TrackRow[]) ?? []);
      setProfiles((p.data as ProfileRow[]) ?? []);
      setPlaylists((pl.data as unknown as PlaylistRow[]) ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [q]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl">
          Search tracks and artists
        </h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ search: { q: input.trim() } });
          }}
          className="relative"
        >
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search artists, tracks, playlists…"
            className="h-12 w-full rounded-full border border-border bg-muted/60 pl-12 pr-4 text-base outline-none focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/30"
          />
        </form>

        {!q.trim() ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">
            Type something to search.
          </p>
        ) : loading ? (
          <p className="mt-10 text-center text-sm text-muted-foreground">Searching…</p>
        ) : (
          <div className="mt-8 space-y-10">
            <section>
              <h2 className="mb-3 text-lg font-semibold">Artists & users</h2>
              {profiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No users found.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {profiles.map((p) => (
                    <li key={p.id}>
                      <Link
                        to="/u/$handle"
                        params={{ handle: p.username ?? p.id }}
                        className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted"
                      >
                        <div className="h-10 w-10 overflow-hidden rounded-full bg-secondary text-center text-sm font-semibold uppercase leading-10 text-secondary-foreground">
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            (p.username ?? "U").charAt(0)
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{p.username ?? "user"}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.account_type === "artist" ? "Artist" : "Listener"}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold">Tracks</h2>
              {tracks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tracks found.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {tracks.map((t) => (
                    <li key={t.id}>
                      <Link
                        to="/t/$trackId"
                        params={{ trackId: t.id }}
                        className="flex items-center gap-3 p-3 hover:bg-muted"
                      >
                        <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-secondary">
                          {t.cover_art_url && (
                            <img src={t.cover_art_url} alt="" className="h-full w-full object-cover" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{t.title}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {t.genre ?? "Unknown genre"} · {t.plays_count ?? 0} plays
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold">Playlists</h2>
              {playlists.length === 0 ? (
                <p className="text-sm text-muted-foreground">No playlists found.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {playlists.map((pl) => {
                    const owner = pl.profiles?.username ?? null;
                    return (
                      <li key={pl.id}>
                        {owner ? (
                          <Link
                            to="/u/$handle"
                            params={{ handle: owner }}
                            className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted"
                          >
                            <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10 text-sm font-semibold text-primary">
                              {pl.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium">{pl.name}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                by @{owner}
                              </div>
                            </div>
                          </Link>
                        ) : (
                          <div className="flex items-center gap-3 rounded-lg border border-border p-3 opacity-60">
                            <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10 text-sm font-semibold text-primary">
                              {pl.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate font-medium">{pl.name}</div>
                              <div className="truncate text-xs text-muted-foreground">Playlist</div>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
