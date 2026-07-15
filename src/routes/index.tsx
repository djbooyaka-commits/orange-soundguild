import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { TrackCard } from "@/components/TrackCard";
import { AdSlot } from "@/components/AdSlot";
import { AdBannerScript } from "@/components/AdBannerScript";
import { useAllTracks } from "@/lib/feed";
import { groupFeed } from "@/lib/albums";
import { AlbumCard } from "@/components/AlbumCard";
import { useIsAdmin, adminDeleteTrack } from "@/hooks/useIsAdmin";
import { useOnlineCount } from "@/hooks/useOnlineCount";
import { useTotalUsers } from "@/hooks/useTotalUsers";
import { toast } from "sonner";
import { Flame, TrendingUp, Users, UserPlus, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Orange Sound Guild — Discover and share music" },
      { name: "description", content: "Stream the latest uploads from independent artists on Orange Sound Guild — a modern music community for creators and listeners." },
      { property: "og:title", content: "Orange Sound Guild — Discover and share music" },
      { property: "og:description", content: "Stream the latest uploads from independent artists on Orange Sound Guild." },
      { property: "og:url", content: "https://orange-soundguild.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://orange-soundguild.lovable.app/" }],
  }),
  component: Index,
});

const AFRO_SUBGENRES = ["Afro House", "Afrobeats", "Amapiano"];
const GENRES = ["All", "Electronic", "House", "Tech House", "Drum and Bass", "Afro", "Hip-Hop", "Lo-fi", "Indie", "Ambient", "Jazz", "Techno", "POP", "Rock", "R&B"];

function Index() {
  const { tracks: uploaded } = useAllTracks();
  const isAdmin = useIsAdmin();
  const onlineCount = useOnlineCount();
  const totalUsers = useTotalUsers();
  const [genre, setGenre] = useState("All");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const feed = useMemo(() => {
    const all = uploaded.filter((t) => !hidden.has(t.id));
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
    <div className="min-h-screen bg-background pb-40">
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
          <div className="relative grid gap-6 p-8 sm:p-12 md:grid-cols-[1fr_320px] md:items-end">
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
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <span>
                    <span className="tabular-nums font-semibold text-white">{onlineCount.toLocaleString()}</span>{" "}
                    {onlineCount === 1 ? "listener" : "listeners"} online now
                  </span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur">
                  <UserPlus className="h-3.5 w-3.5 text-primary" />
                  <span>
                    <span className="tabular-nums font-semibold text-white">
                      {totalUsers === null ? "—" : totalUsers.toLocaleString()}
                    </span>{" "}
                    {totalUsers === 1 ? "member" : "members"} joined
                  </span>
                </div>
              </div>
            </div>
            <div className="hidden md:block">
              <AdBannerScript className="border-white/10 bg-black/30 text-white/80" />
            </div>
          </div>
        </section>

        {/* Ad banner (mobile only — desktop shows it in the hero) */}
        <AdBannerScript className="mt-6 md:hidden" />





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
              {groupFeed(feed).map((item) =>
                item.type === "album" ? (
                  <AlbumCard key={item.album.key} album={item.album} />
                ) : (
                  <TrackCard
                    key={item.track.id}
                    track={item.track}
                    onDelete={isAdmin ? handleAdminDelete : undefined}
                  />
                ),
              )}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
