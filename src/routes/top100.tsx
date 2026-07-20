import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, Pause, Trophy, Headphones, Shuffle } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { signMany } from "@/lib/signMedia";
import { usePlayer } from "@/components/player/PlayerContext";
import type { Track } from "@/lib/tracks";
import cover2 from "@/assets/cover2.jpg";

export const Route = createFileRoute("/top100")({
  head: () => ({
    meta: [
      { title: "Top 100 — Orange Sound Guild" },
      { name: "description", content: "The 100 most-played tracks on Orange Sound Guild right now." },
      { property: "og:title", content: "Top 100 — Orange Sound Guild" },
      { property: "og:description", content: "The 100 most-played tracks on Orange Sound Guild right now." },
      { property: "og:url", content: "https://orange-soundguild.lovable.app/top100" },
    ],
    links: [{ rel: "canonical", href: "https://orange-soundguild.lovable.app/top100" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "MusicPlaylist",
          name: "Top 100 — Orange Sound Guild",
          description: "The 100 most-played tracks on Orange Sound Guild right now.",
          url: "https://orange-soundguild.lovable.app/top100",
          numTracks: 100,
        }),
      },
    ],
  }),
  component: Top100,
});

type Row = {
  id: string;
  title: string;
  genre: string;
  audio_url: string;
  cover_art_url: string | null;
  created_at: string;
  user_id: string;
  plays_count: number | null;
  profiles: { username: string | null } | null;
};

function Top100() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const { current, isPlaying, play, toggle, shuffle, toggleShuffle } = usePlayer();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tracks")
        .select(
          "id, title, genre, audio_url, cover_art_url, created_at, user_id, plays_count, profiles(username)",
        )
        .order("plays_count", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled || !data) return;
      const rows = data as Row[];
      const items: { bucket: "audio" | "covers"; path: string | null | undefined }[] = [];
      rows.forEach((r) => {
        items.push({ bucket: "audio", path: r.audio_url });
        items.push({ bucket: "covers", path: r.cover_art_url });
      });
      const urls = await signMany(items);
      const hydrated: Track[] = rows.map((r, i) => ({
        id: r.id,
        title: r.title,
        artist: r.profiles?.username ?? "Artist",
        cover: urls[i * 2 + 1] ?? cover2,
        src: urls[i * 2] ?? "",
        durationLabel: "—:—",
        uploadedAt: "",
        plays: r.plays_count ?? 0,
        genre: r.genre,
      }));
      if (!cancelled) {
        setTracks(hydrated);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const playAll = () => {
    if (!tracks.length) return;
    play(tracks[0], tracks);
  };

  const shufflePlay = () => {
    if (!tracks.length) return;
    if (!shuffle) toggleShuffle();
    const idx = Math.floor(Math.random() * tracks.length);
    play(tracks[idx], tracks);
  };

  const rowPlay = (t: Track) => {
    if (current?.id === t.id) toggle();
    else play(t, tracks);
  };

  const formatPlays = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return `${n}`;
  };

  return (
    <div className="min-h-screen bg-background pb-40">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 sm:px-6">
        {/* Hero */}
        <section className="relative mt-6 overflow-hidden rounded-2xl border border-border bg-secondary text-secondary-foreground">
          <div
            aria-hidden
            className="absolute inset-0 opacity-90"
            style={{
              background:
                "radial-gradient(700px 300px at 90% -20%, oklch(0.72 0.19 45 / 0.7), transparent 60%), radial-gradient(500px 250px at 0% 120%, oklch(0.72 0.19 45 / 0.35), transparent 60%)",
            }}
          />
          <div className="relative flex flex-col gap-6 p-8 sm:flex-row sm:items-end sm:justify-between sm:p-12">
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80">
                <Trophy className="h-3 w-3 text-primary" /> Chart
              </span>
              <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
                Top <span className="text-primary">100</span>
              </h1>
              <p className="mt-2 max-w-lg text-sm text-white/70">
                The 100 most-played tracks on Orange Sound Guild, updated in real time as listeners finish tracks.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <button
                onClick={playAll}
                disabled={!tracks.length}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
              >
                <Play className="h-4 w-4 fill-current" />
                Play all
              </button>
              <button
                onClick={shufflePlay}
                disabled={!tracks.length}
                aria-pressed={shuffle}
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
              >
                <Shuffle className="h-4 w-4" />
                Shuffle
              </button>
            </div>
          </div>
        </section>

        {/* Chart list */}
        <section className="mt-8">
          {loading ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
              Loading the chart…
            </div>
          ) : tracks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
              No tracks yet. Be the first to upload!
            </div>
          ) : (
            <ol className="overflow-hidden rounded-xl border border-border bg-card">
              {tracks.map((t, i) => {
                const active = current?.id === t.id;
                const playing = active && isPlaying;
                return (
                  <li
                    key={t.id}
                    className={`group grid grid-cols-[2.5rem_3rem_1fr_auto] items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0 sm:grid-cols-[3rem_3.5rem_1fr_6rem_auto] sm:px-4 ${
                      active ? "bg-primary/5" : "hover:bg-muted/60"
                    }`}
                  >
                    <div
                      className={`text-center text-sm font-bold tabular-nums ${
                        i < 3 ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {i + 1}
                    </div>
                    <button
                      onClick={() => rowPlay(t)}
                      className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border sm:h-14 sm:w-14"
                      aria-label={playing ? `Pause ${t.title}` : `Play ${t.title}`}
                    >
                      <img src={t.cover} alt="" className="h-full w-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100 data-[active=true]:opacity-100" data-active={active}>
                        {playing ? (
                          <Pause className="h-5 w-5 fill-white text-white" />
                        ) : (
                          <Play className="h-5 w-5 fill-white text-white" />
                        )}
                      </span>
                    </button>
                    <div className="min-w-0">
                      <Link
                        to="/t/$trackId"
                        params={{ trackId: t.id }}
                        className={`block truncate text-sm font-semibold hover:underline ${
                          active ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {t.title}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">
                        {t.artist} · {t.genre}
                      </div>
                    </div>
                    <div className="hidden items-center gap-1 text-xs text-muted-foreground tabular-nums sm:flex">
                      <Headphones className="h-3.5 w-3.5" />
                      {formatPlays(t.plays)}
                    </div>
                    <div className="text-right text-[10px] text-muted-foreground sm:hidden">
                      {formatPlays(t.plays)}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}
