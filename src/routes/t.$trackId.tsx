import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Play, Pause, Heart, ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Comments } from "@/components/Comments";
import { useAllTracks } from "@/lib/feed";
import { usePlayer } from "@/components/player/PlayerContext";
import { useTrackLike } from "@/lib/likes";
import { AddToPlaylistMenu } from "@/components/AddToPlaylistMenu";

export const Route = createFileRoute("/t/$trackId")({
  head: ({ params }) => {
    const url = `https://orange-soundguild.lovable.app/t/${params.trackId}`;
    const title = `Track on Orange Sound Guild`;
    const description = `Stream this track on Orange Sound Guild — discover music from independent artists.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "music.song" },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MusicRecording",
            url,
            identifier: params.trackId,
          }),
        },
      ],
    };
  },
  component: TrackPage,
});

function TrackPage() {
  const { trackId } = Route.useParams();
  const { tracks: uploaded, loading } = useAllTracks();
  const { current, isPlaying, play, toggle } = usePlayer();
  const navigate = useNavigate();

  const track = useMemo(
    () => uploaded.find((t) => t.id === trackId),
    [uploaded, trackId],
  );

  const like = useTrackLike(trackId);
  const active = current?.id === trackId;
  const playing = active && isPlaying;

  if (!track) {
    return (
      <div className="min-h-screen bg-background pb-28">
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading track…" : "Track not found."}
          </p>
          <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
            ← Back to feed
          </Link>
        </main>
      </div>
    );
  }

  const onPlay = () => {
    if (active) toggle();
    else play(track);
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <Navbar />

      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <button
          onClick={() => navigate({ to: "/" })}
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <section className="mt-4 grid gap-6 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[280px_1fr] sm:p-6">
          <img
            src={track.cover}
            alt={`${track.title} cover`}
            className="aspect-square w-full rounded-xl object-cover"
          />
          <div className="flex flex-col">
            <span className="w-fit rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
              {track.genre}
            </span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{track.title}</h1>
            <Link
              to="/u/$handle"
              params={{ handle: track.artist }}
              className="mt-1 text-sm text-muted-foreground hover:text-primary"
            >
              {track.artist}
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">
              {track.uploadedAt} · {track.plays.toLocaleString()} plays
            </p>

            <div className="mt-auto flex items-center gap-3 pt-6">
              <button
                onClick={onPlay}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-105"
              >
                {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
                {playing ? "Pause" : "Play"}
              </button>
              <button
                onClick={like.toggle}
                aria-pressed={like.liked}
                className={`inline-flex h-12 items-center gap-2 rounded-full border border-border px-5 text-sm font-medium transition ${
                  like.liked ? "text-primary" : "text-foreground hover:border-primary/40"
                }`}
              >
                <Heart className={`h-4 w-4 ${like.liked ? "fill-current" : ""}`} />
                {like.count}
              </button>
              <AddToPlaylistMenu trackId={track.id} trackTitle={track.title} variant="inline" />
            </div>
          </div>
        </section>

        <Comments trackId={track.id} title={track.title} />
      </main>
    </div>
  );
}
