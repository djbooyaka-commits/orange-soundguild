import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { TrackCard } from "@/components/TrackCard";
import { tracks } from "@/lib/tracks";
import { useUploads } from "@/lib/uploads";
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

function Index() {
  return (
    <PlayerProvider>
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
              <div className="flex gap-2">
                <button className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)]">
                  Start listening
                </button>
                <button className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
                  Upload yours
                </button>
              </div>
            </div>
          </section>

          {/* Recent uploads */}
          <section className="mt-10">
            <header className="mb-5 flex items-end justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Recent uploads
                </h2>
                <p className="text-sm text-muted-foreground">Chronological feed — newest first.</p>
              </div>
              <div className="hidden gap-1 text-xs text-muted-foreground sm:flex">
                {["All", "Electronic", "Lo-fi", "Indie", "Ambient", "Jazz"].map((g, i) => (
                  <button
                    key={g}
                    className={`rounded-full px-3 py-1.5 transition ${
                      i === 0
                        ? "bg-secondary text-secondary-foreground"
                        : "border border-border hover:bg-muted"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </header>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {tracks.map((t) => (
                <TrackCard key={t.id} track={t} />
              ))}
            </div>
          </section>
        </main>

        <PlayerBar />
      </div>
    </PlayerProvider>
  );
}
