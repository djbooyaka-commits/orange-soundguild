import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SubmitTrackCard, type SubmissionPlaylist } from "@/components/SubmitTrackCard";
import { Button } from "@/components/ui/button";
import { filterSubmissionPlaylists, resolveSubmissionPlaylistId } from "@/lib/playlist-submission-selection";
import { listPoolPlaylists } from "@/lib/api/curator-submissions.functions";
import { PLAYLIST_GENRES } from "@/lib/playlist-genres";
import { PLATFORM_LABELS, type PlaylistPlatform } from "@/lib/playlist-platforms";

const PLATFORM_TABS: Array<"all" | PlaylistPlatform> = ["all", "spotify", "youtube", "tidal", "apple_music", "osg"];

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
  validateSearch: (search: Record<string, unknown>): { platform?: string } =>
    typeof search.platform === "string" ? { platform: search.platform } : {},
  component: CuratorPlaylistsPage,
});

type PoolPlaylist = SubmissionPlaylist;

function playlistHref(p: PoolPlaylist) {
  if (p.external_url) return p.external_url;
  return `https://open.spotify.com/playlist/${p.spotify_playlist_id}`;
}

function CuratorPlaylistsPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [playlists, setPlaylists] = useState<PoolPlaylist[]>([]);
  const [genre, setGenre] = useState("All");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const submissionForm = useRef<HTMLDivElement>(null);
  const listPool = useServerFn(listPoolPlaylists);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const platform = PLATFORM_TABS.includes(search.platform as PlaylistPlatform) ? (search.platform as PlaylistPlatform) : "all";
  const setPlatform = (p: "all" | PlaylistPlatform) =>
    navigate({ search: p === "all" ? {} : { platform: p }, replace: true });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    listPool()
      .then((rows) => setPlaylists(rows as PoolPlaylist[]))
      .catch(() => setPlaylists([]));
  }, [signedIn, listPool]);

  const shown = filterSubmissionPlaylists(playlists, platform, genre);
  const activePlaylistId = resolveSubmissionPlaylistId(shown, selectedPlaylistId);
  const openSubmission = (id: string) => {
    setSelectedPlaylistId(id);
    const form = submissionForm.current;
    form?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    form?.querySelector("select")?.focus({ preventScroll: true });
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold">Curator Playlists</h1>
      <p className="mt-2 text-muted-foreground">
        Every playlist from curators in the Orange Sound Guild Curator Pool. Artist accounts get a free 50-point pass
        each day (resets 00:00 UTC).
      </p>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Streaming service">
        {PLATFORM_TABS.map((p) => (
          <Button
            key={p}
            variant={platform === p ? "default" : "outline"}
            type="button"
            role="tab"
            aria-selected={platform === p}
            onClick={() => setPlatform(p)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold ${platform === p ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"}`}
          >
            {p === "all" ? "All" : PLATFORM_LABELS[p]}
          </Button>
        ))}
      </div>
      <div className="mt-6 space-y-6">
        {signedIn === null ? null : signedIn ? (
          <>
            <div ref={submissionForm} className="scroll-mt-6">
              <SubmitTrackCard pool playlistOptions={shown} selectedPlaylistId={activePlaylistId} onPlaylistChange={setSelectedPlaylistId} />
            </div>
            {playlists.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {["All", ...PLAYLIST_GENRES].map((g) => (
                  <Button
                    key={g}
                    variant={genre === g ? "default" : "outline"}
                    type="button"
                    onClick={() => setGenre(g)}
                    className={`rounded-full border px-4 py-1.5 text-sm ${genre === g ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"}`}
                  >
                    {g}
                  </Button>
                ))}
              </div>
            )}
            {playlists.length > 0 && shown.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No {genre === "All" ? "" : `${genre} `}playlists{platform === "all" ? "" : ` on ${PLATFORM_LABELS[platform]}`} yet.
              </p>
            )}
            {shown.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-2">
                {shown.map((p) => (
                  <li key={p.id} className={`flex min-w-0 items-center gap-3 rounded-lg border bg-card p-3 ${activePlaylistId === p.id ? "border-primary ring-1 ring-primary/20" : "border-border"}`}>
                    <Button variant="ghost" onClick={() => openSubmission(p.id)} aria-label={`Submit to ${p.name}`} aria-pressed={activePlaylistId === p.id} className="h-auto min-w-0 flex-1 justify-start gap-3 whitespace-normal p-0 text-left hover:bg-transparent">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
                    ) : (
                      <div className="h-16 w-16 shrink-0 rounded-md bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">@{p.curator_username}</p>
                      <span className="mr-1 mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {PLATFORM_LABELS[(p.platform ?? "spotify") as PlaylistPlatform] ?? "Spotify"}
                      </span>
                      {p.genre && (
                        <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{p.genre}</span>
                      )}
                    </div>
                    </Button>
                    <Button asChild variant="outline" size="icon" className="shrink-0 text-primary">
                    <a
                      href={playlistHref(p)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${p.name}`}
                      title="Open playlist"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-primary hover:bg-muted"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    </Button>
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
