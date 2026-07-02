import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { TrackCard } from "@/components/TrackCard";
import { tracks } from "@/lib/tracks";
import { useAllTracks } from "@/lib/feed";
import { useIsAdmin, adminDeleteTrack } from "@/hooks/useIsAdmin";
import { toast } from "sonner";
import { Flame, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "soundwave — discover and share sound" },
      { name: "description", content: "Stream the latest uploads from independent artists. A modern music community in orange and charcoal." },
      { property: "og:title", content: "soundwave — discover and share sound" },
      { property: "og:description", content: "Stream the latest uploads from independent artists." },
    ],
  }),
  component: Index,
});

const GENRES = ["All", "Electronic", "Hip Hop", "Lo-fi", "Indie", "Ambient", "Jazz", "Techno", "Podcasts"];

function Index() {
  const { tracks: uploaded } = useAllTracks();
  const { current } = usePlayer();
  const isAdmin = useIsAdmin();
  const [genre, setGenre] = useState("All");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const feed = useMemo(() => {
    const all = [...uploaded, ...tracks].filter((t) => !hidden.has(t.id));
    if (genre === "All") return all;
    return all.filter((t) => t.genre.toLowerCase() === genre.toLowerCase());
  }, [uploaded, genre, hidden]);

  const handleAdminDelete = async (id: string) => {
    try {
      await adminDeleteTrack(id);
      setHidden((prev) => new Set(prev).add(id));
      toast.success("Track removed.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Hero */}
        <section className="relative mt-6 overflow-hidden rounded-2xl border border-border bg-secondary text-secondary-foreground">
          <div
            aria-hidden
            className="absolute inset-0 opacity-80"
            style={{
              background:
                "radial-gradient(900px 300px at 85% -10%, oklch(0.72 0.19 45 / 0.55), transparent 60%), radial-gradient(600px 250px at 10% 110%, oklch(0.72 0.19 45 / 0.25), transparent 60%)",
            }}
          />
          <div className="relative grid gap-6 p-8 sm:p-12 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80">
                <Flame className="h-3 w-3 text-primary" /> What's new today
              </span>
              <h1 className="mt-3 max-w-2xl text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
                Hear what the world uploaded <span className="text-primary">in the last hour.</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm text-white/70">
                A community of producers, bedroom artists and labels. Fresh tracks, every minute — straight to your queue.
              </p>
            </div>
          </div>
        </section>

        {/* Genre tag bar */}
        <nav
          aria-label="Filter by genre"
          className="mt-6 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
        >
          {GENRES.map((g) => {
            const active = g === genre;
            return (
              <button
                key={g}
                onClick={() => setGenre(g)}
                className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {g}
              </button>
            );
          })}
        </nav>

        {/* Recent uploads */}
        <section className="mt-8">
          <header className="mb-5 flex items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
                <TrendingUp className="h-5 w-5 text-primary" />
                Recent uploads
              </h2>
              <p className="text-sm text-muted-foreground">
                {genre === "All" ? "Chronological feed — newest first." : `Showing ${genre} tracks`}
              </p>
            </div>
          </header>

          {feed.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
              No tracks in {genre} yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {feed.map((t) => (
                <TrackCard key={t.id} track={t} onDelete={isAdmin ? handleAdminDelete : undefined} />
              ))}
            </div>
          )}
        </section>

        {/* Comments on the currently playing track */}
        {current && <Comments key={current.id} trackId={current.id} title={current.title} />}
      </main>
    </div>
  );
}
