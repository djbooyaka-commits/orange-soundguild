import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Headphones, Music2, Play } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getMyListeningStats, type TopArtist, type TopTrack } from "@/lib/api/listening.functions";
import { signMany } from "@/lib/signMedia";
import defaultAvatar from "@/assets/avatar.jpg";

export function SuperfanTopStats() {
  const fetchStats = useServerFn(getMyListeningStats);
  const [loading, setLoading] = useState(true);
  const [topTrack, setTopTrack] = useState<TopTrack | null>(null);
  const [topArtist, setTopArtist] = useState<TopArtist | null>(null);
  const [trackCover, setTrackCover] = useState<string | null>(null);
  const [artistAvatar, setArtistAvatar] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchStats();
        if (cancelled) return;
        setTopTrack(res.topTrack);
        setTopArtist(res.topArtist);
        const [cover, avatar] = await signMany([
          { bucket: "covers", path: res.topTrack?.cover_art_url },
          { bucket: "avatars", path: res.topArtist?.avatar_url },
        ]);
        if (cancelled) return;
        setTrackCover(cover);
        setArtistAvatar(avatar);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="h-28 animate-pulse rounded-xl bg-muted" />
        <div className="h-28 animate-pulse rounded-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!topTrack && !topArtist) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Start listening to build up your top track and artist.
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="mb-4 text-lg font-bold tracking-tight">Your listening</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {topTrack && (
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
              {trackCover ? (
                <img src={trackCover} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Music2 className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Most played track</p>
              <Link
                to="/t/$trackId"
                params={{ trackId: topTrack.track_id }}
                className="mt-0.5 block truncate text-sm font-semibold hover:text-primary"
              >
                {topTrack.title}
              </Link>
              {topTrack.artist_username && (
                <Link
                  to="/u/$handle"
                  params={{ handle: topTrack.artist_username }}
                  className="block truncate text-xs text-muted-foreground hover:text-primary"
                >
                  @{topTrack.artist_username}
                </Link>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {topTrack.plays.toLocaleString()} plays
              </p>
            </div>
            <button
              onClick={() =>
                playTrack({
                  id: topTrack.track_id,
                  title: topTrack.title,
                  artist: topTrack.artist_username ?? "Artist",
                  cover: trackCover ?? "",
                  audioUrl: "",
                })
              }
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:brightness-105"
              aria-label="Play"
            >
              <Play className="ml-0.5 h-4 w-4" />
            </button>
          </div>
        )}

        {topArtist && (
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
            <img
              src={artistAvatar ?? defaultAvatar}
              alt=""
              className="h-20 w-20 shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Most played artist</p>
              {topArtist.username ? (
                <Link
                  to="/u/$handle"
                  params={{ handle: topArtist.username }}
                  className="mt-0.5 block truncate text-sm font-semibold hover:text-primary"
                >
                  @{topArtist.username}
                </Link>
              ) : (
                <p className="mt-0.5 truncate text-sm font-semibold">Unknown artist</p>
              )}
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Headphones className="h-3 w-3" /> {topArtist.plays.toLocaleString()} plays
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
