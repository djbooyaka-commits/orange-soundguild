import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Play, Pause, Heart, ArrowLeft, Share2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { Comments } from "@/components/Comments";
import { useAllTracks } from "@/lib/feed";
import { usePlayer } from "@/components/player/PlayerContext";
import { useTrackLike } from "@/lib/likes";
import { AddToPlaylistMenu } from "@/components/AddToPlaylistMenu";
import { supabase } from "@/integrations/supabase/client";
import { getTrackShareMeta } from "@/lib/api/track-share.functions";

export const Route = createFileRoute("/t/$trackId")({
  loader: ({ params }) => getTrackShareMeta({ data: { trackId: params.trackId } }),
  head: ({ params, loaderData }) => {
    const url = `https://orangesoundguild.com/t/${params.trackId}`;
    const meta = loaderData ?? null;
    const trackTitle = meta?.title ?? "Track";
    const artist = meta?.artist ?? "Independent artist";
    const title = `${trackTitle} — ${artist} · Orange Sound Guild`;
    const description = meta?.title
      ? `Listen to "${trackTitle}" by ${artist} on Orange Sound Guild.`
      : `Stream this track on Orange Sound Guild — discover music from independent artists.`;
    const image = meta?.coverUrl ?? null;
    const imageType = image
      ? /\.png(\?|$)/i.test(image)
        ? "image/png"
        : /\.webp(\?|$)/i.test(image)
          ? "image/webp"
          : /\.gif(\?|$)/i.test(image)
            ? "image/gif"
            : "image/jpeg"
      : null;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "music.song" },
        { property: "og:url", content: url },
        ...(image
          ? [
              { property: "og:image", content: image },
              { property: "og:image:secure_url", content: image },
              { property: "og:image:type", content: imageType as string },
              { property: "og:image:width", content: "1200" },
              { property: "og:image:height", content: "1200" },
              { property: "og:image:alt", content: `${trackTitle} cover art` },
              { name: "twitter:card", content: "summary_large_image" },
              { name: "twitter:title", content: title },
              { name: "twitter:description", content: description },
              { name: "twitter:image", content: image },
              { name: "twitter:image:alt", content: `${trackTitle} cover art` },
            ]
          : [{ name: "twitter:card", content: "summary" }]),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "MusicRecording",
            url,
            name: meta?.title ?? undefined,
            byArtist: meta?.artist ? { "@type": "MusicGroup", name: meta.artist } : undefined,
            image: image ?? undefined,
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

  // Capture ?ref=CODE from track share links so signup credits the artist
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      const clean = ref.trim().toUpperCase().slice(0, 32);
      if (clean) window.sessionStorage.setItem("ref_code", clean);
    }
  }, []);

  // Fetch the artist's referral code so we can build a share link
  const [artistRefCode, setArtistRefCode] = useState<string | null>(null);
  useEffect(() => {
    let cancel = false;
    (async () => {
      // referral_code is not readable directly from profiles (private column).
      // Use the SECURITY DEFINER RPC that returns only this track's artist code.
      const { data } = await supabase.rpc("get_track_share_ref", {
        _track_id: trackId,
      });
      if (!cancel) setArtistRefCode((data as string | null) ?? null);
    })();
    return () => {
      cancel = true;
    };
  }, [trackId]);

  const shareUrl = useMemo(() => {
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://orangesoundguild.com";
    return artistRefCode
      ? `${origin}/t/${trackId}?ref=${artistRefCode}`
      : `${origin}/t/${trackId}`;
  }, [artistRefCode, trackId]);

  const copyShare = () => {
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => toast.success("Share link copied"))
      .catch(() => toast.error("Copy failed"));
  };

  const shareTrack = () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator
        .share({ title: track?.title ?? "Track", url: shareUrl })
        .catch(() => {});
    } else {
      copyShare();
    }
  };

  if (!track) {
    return (
      <div className="min-h-screen bg-background pb-40">
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
    <div className="min-h-screen bg-background pb-40">
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
              <button
                onClick={shareTrack}
                className="inline-flex h-12 items-center gap-2 rounded-full border border-border px-5 text-sm font-medium transition hover:border-primary/40"
                title={shareUrl}
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>
              <button
                onClick={copyShare}
                aria-label="Copy share link"
                className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-border text-sm transition hover:border-primary/40"
                title={shareUrl}
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        <Comments trackId={track.id} title={track.title} />
      </main>
    </div>
  );
}
