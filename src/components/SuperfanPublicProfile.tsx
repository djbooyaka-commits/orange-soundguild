import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Headphones, Music2, Play, Users } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  getSuperfanPublicProfile,
  type FollowingUser,
  type TopArtist,
  type TopTrack,
} from "@/lib/api/listening.functions";
import { signMany } from "@/lib/signMedia";
import defaultAvatar from "@/assets/avatar.jpg";

export function SuperfanPublicProfile({ userId, displayName }: { userId: string; displayName: string }) {
  const fetchProfile = useServerFn(getSuperfanPublicProfile);
  const [loading, setLoading] = useState(true);
  const [isSuperfan, setIsSuperfan] = useState(false);
  const [topTrack, setTopTrack] = useState<TopTrack | null>(null);
  const [topArtist, setTopArtist] = useState<TopArtist | null>(null);
  const [following, setFollowing] = useState<FollowingUser[]>([]);
  const [trackCover, setTrackCover] = useState<string | null>(null);
  const [artistAvatar, setArtistAvatar] = useState<string | null>(null);
  const [followingAvatars, setFollowingAvatars] = useState<(string | null)[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchProfile({ data: { userId } });
        if (cancelled) return;
        setIsSuperfan(res.isSuperfan);
        setTopTrack(res.topTrack);
        setTopArtist(res.topArtist);
        setFollowing(res.following);
        const signed = await signMany([
          { bucket: "covers", path: res.topTrack?.cover_art_url },
          { bucket: "avatars", path: res.topArtist?.avatar_url },
          ...res.following.map((f) => ({ bucket: "avatars" as const, path: f.avatar_url })),
        ]);
        if (cancelled) return;
        setTrackCover(signed[0]);
        setArtistAvatar(signed[1]);
        setFollowingAvatars(signed.slice(2));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchProfile, userId]);

  if (loading) {
    return <div className="mt-8 h-28 animate-pulse rounded-xl bg-muted" />;
  }
  if (!isSuperfan) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-4 text-lg font-bold tracking-tight">
        What {displayName} is into
      </h2>

      {topTrack || topArtist ? (
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
              <Link
                to="/t/$trackId"
                params={{ trackId: topTrack.track_id }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:brightness-105"
                aria-label="Open track"
              >
                <Play className="ml-0.5 h-4 w-4" />
              </Link>
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
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No listening activity yet.
        </div>
      )}

      <h3 className="mt-8 mb-3 flex items-center gap-2 text-base font-bold tracking-tight">
        <Users className="h-4 w-4 text-primary" /> Following ({following.length})
      </h3>
      {following.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not following anyone yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {following.map((f, i) => (
            <Link
              key={f.user_id}
              to="/u/$handle"
              params={{ handle: f.username ?? f.user_id }}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center transition hover:border-primary/50"
            >
              <img
                src={followingAvatars[i] ?? defaultAvatar}
                alt=""
                className="h-14 w-14 rounded-full object-cover"
              />
              <span className="truncate text-xs font-semibold">
                @{f.username ?? "user"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
